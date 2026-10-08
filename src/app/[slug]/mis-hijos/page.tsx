import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { DocumentStatusChip } from "@/components/document-status-chip";
import { Avatar, Card, Chip, SectionTitle, Tile } from "@/components/ui";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { addDays, formatDayTitle, todayIn } from "@/lib/dates";
import { ageOn } from "@/modules/athletes/enrollment-status";
import { attendanceHistory, attendanceStats } from "@/modules/attendance/attendance";
import { upcomingForFamily } from "@/modules/attendance/family";
import { ATTENDANCE_LABELS } from "@/modules/attendance/labels";
import { listAthleteDocuments } from "@/modules/documents/documents";
import { fileHref } from "@/modules/files/files";
import { describeSchedule } from "@/modules/groups/schedule";
import { getMemberHome } from "@/modules/portal/member-home";
import { findAgeCategory, sportsAge } from "@/modules/schools/age-category";
import { getSportsStructure } from "@/modules/schools/queries";
import { ensureSessions } from "../asistencia/sync";
import { getSchoolContext } from "../data";
import { UpcomingClasses } from "./upcoming-classes";
import { PerformanceCard, toProgressView } from "@/components/performance-card";
import { athleteProgress } from "@/modules/sports/performances";
import { EvaluationsCard, toEvaluationsView } from "@/components/evaluations-card";
import { athleteEvaluations } from "@/modules/sports/evaluations";
import { CompetitionHistory } from "@/components/competition-history";
import { BadgesCard } from "@/components/badges-card";
import { BodyCard } from "@/components/body-card";
import { bodyProfile } from "@/modules/athletes/body";
import { toBodyView } from "@/modules/athletes/body-view";
import { listBadges } from "@/modules/badges/badges";
import { athleteCompetitions, familyInvitations } from "@/modules/competitions/competitions";
import { CompetitionInvitations } from "./competition-invitations";

export const metadata: Metadata = { title: "Mis hijos" };

export default async function MyKidsPage({ params }: PageProps<"/[slug]/mis-hijos">) {
  const { slug } = await params;
  const { school, user } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const [home, structure] = await Promise.all([
    getMemberHome(db, school.id, user.id),
    getSportsStructure(db, school.id),
  ]);
  const invitations = await asPortalUser(user.id, () => familyInvitations(db, school.id, today));
  const details = await asPortalUser(user.id, async () => {
    const ids = home.athletes.map((a) => a.id);
    await ensureSessions(school.id, school.timezone);
    const [stats, upcoming] = await Promise.all([
      attendanceStats(db, school.id, ids, { from: addDays(today, -30), to: today }),
      upcomingForFamily(db, school.id, ids, today, new Date(), school.timezone),
    ]);
    return Promise.all(
      home.athletes.map(async (a) => ({
        athlete: a,
        stats: stats.get(a.id),
        upcoming: upcoming.get(a.id) ?? [],
        progress: await athleteProgress(db, school.id, a.id, today),
        evaluations: await athleteEvaluations(db, school.id, a.id),
        competitions: await athleteCompetitions(db, school.id, a.id),
        badges: await listBadges(db, school.id, a.id),
        body: await bodyProfile(db, school.id, a.id, { includeHealth: false }),
        history: await attendanceHistory(db, school.id, a.id, 8),
        documents: await listAthleteDocuments(db, school.id, a.id, today),
      })),
    );
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={home.athletes.some((a) => a.isPayer !== null) ? "Mis hijos" : "Mis clases"}
        subtitle={school.name}
      />
      {invitations.length > 0 && (
        <CompetitionInvitations
          slug={slug}
          invitations={invitations.map(({ entry, competition: c, firstName }) => ({
            entryId: entry.id,
            firstName,
            status: entry.status,
            events: entry.events,
            chosenExtras: entry.extras,
            competition: {
              name: c.name,
              dates: c.startsOn === c.endsOn ? c.startsOn : `${c.startsOn} a ${c.endsOn}`,
              place: [c.venue, c.city].filter(Boolean).join(", "),
              deadline: c.registrationDeadline,
              open: today <= c.registrationDeadline,
              entryFee: c.entryFee,
              extras: c.extras,
              authorizationText: c.authorizationText,
              notes: c.notes,
            },
          }))}
        />
      )}
      {details.length === 0 && (
        <Card className="text-center text-sm text-ink-soft">No hay alumnos vinculados a tu cuenta.</Card>
      )}
      {details.map(
        ({
          athlete: a,
          stats,
          history,
          documents,
          upcoming,
          progress,
          evaluations,
          competitions,
          badges,
          body,
        }) => {
          const name = `${a.firstName} ${a.lastName}`;
          const category = findAgeCategory(
            sportsAge(a.birthDate, Number(today.slice(0, 4))),
            structure.ageCategories,
          );
          return (
            <Card key={a.id} className="space-y-4" aria-label={name}>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={name} size={56} src={a.photoFileId ? fileHref(slug, a.photoFileId) : null} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold">{name}</h2>
                  <p className="flex flex-wrap gap-2 text-sm text-ink-soft">
                    {ageOn(a.birthDate, today)} años
                    {category && <Chip tone="violet">Categoría {category.name}</Chip>}
                    {stats?.rate != null && <Chip tone="mint">Asistencia 30 días: {stats.rate} %</Chip>}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <div>
                  <SectionTitle>Grupos y horario</SectionTitle>
                  <ul className="space-y-2">
                    {a.enrollments.map(({ group }) => (
                      <li key={group.id}>
                        <Tile className="p-3">
                          <p className="flex items-center gap-2 font-semibold">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ background: group.color }}
                              aria-hidden
                            />
                            {group.name}
                          </p>
                          <p className="text-xs text-ink-soft">{group.levelName ?? "Varios niveles"}</p>
                          <p className="mt-1 flex items-start gap-1.5 text-sm">
                            <Clock className="mt-0.5 size-3.5 shrink-0" /> {describeSchedule(group.schedule)}
                          </p>
                        </Tile>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <SectionTitle>Asistencia reciente</SectionTitle>
                  <ul className="space-y-1.5 text-sm" aria-label={`Asistencia de ${a.firstName}`}>
                    {history.map((h, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="flex-1 capitalize">{formatDayTitle(h.date)}</span>
                        <Chip
                          tone={
                            h.status === "ABSENT"
                              ? "danger"
                              : h.status === "EXCUSED"
                                ? "violet"
                                : h.status === "LATE"
                                  ? "sun"
                                  : "mint"
                          }
                        >
                          {ATTENDANCE_LABELS[h.status].long}
                        </Chip>
                      </li>
                    ))}
                    {history.length === 0 && <li className="text-ink-soft">Aún no hay registros.</li>}
                  </ul>
                </div>
                <div>
                  <SectionTitle>Documentos</SectionTitle>
                  <ul className="space-y-1.5 text-sm">
                    {documents.map((d) => (
                      <li key={d.type.id} className="flex items-center gap-2">
                        <span className="flex-1">{d.type.name}</span>
                        <DocumentStatusChip status={d.status} />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink-soft">
                    Para entregar o renovar un documento, envíalo a la escuela.
                  </p>
                </div>
              </div>
              {progress.length > 0 && (
                // Las familias solo ven a sus hijos, así que el comparativo de categoría no aplica.
                <PerformanceCard
                  title={`Marcas de ${a.firstName}`}
                  tests={toProgressView(progress, { withCategory: false })}
                />
              )}
              {(evaluations.current || evaluations.evaluations.length > 0) && (
                <EvaluationsCard
                  slug={slug}
                  title={`Nivel y evaluaciones de ${a.firstName}`}
                  {...toEvaluationsView(evaluations)}
                />
              )}
              {badges.length > 0 && <BadgesCard title={`Insignias de ${a.firstName}`} badges={badges} />}
              <BodyCard
                slug={slug}
                athleteId={a.id}
                firstName={a.firstName}
                mode="family"
                today={today}
                {...toBodyView(body)}
              />
              {competitions.length > 0 && (
                <CompetitionHistory title={`Competencias de ${a.firstName}`} history={competitions} />
              )}
              <div>
                <SectionTitle>Próximas clases</SectionTitle>
                <UpcomingClasses
                  slug={slug}
                  athleteId={a.id}
                  firstName={a.firstName}
                  classes={upcoming.map((c) => ({
                    sessionId: c.sessionId,
                    label: `${formatDayTitle(c.date)} · ${c.startTime}`,
                    groupName: c.groupName,
                    familyReported: c.familyReported,
                    recorded: c.recorded,
                  }))}
                />
              </div>
            </Card>
          );
        },
      )}
    </div>
  );
}
