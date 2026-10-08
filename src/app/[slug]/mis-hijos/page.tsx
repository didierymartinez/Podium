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
import { ATTENDANCE_LABELS } from "@/modules/attendance/labels";
import { listAthleteDocuments } from "@/modules/documents/documents";
import { fileHref } from "@/modules/files/files";
import { describeSchedule } from "@/modules/groups/schedule";
import { getMemberHome } from "@/modules/portal/member-home";
import { findAgeCategory, sportsAge } from "@/modules/schools/age-category";
import { getSportsStructure } from "@/modules/schools/queries";
import { getSchoolContext } from "../data";

export const metadata: Metadata = { title: "Mis hijos" };

export default async function MyKidsPage({ params }: PageProps<"/[slug]/mis-hijos">) {
  const { slug } = await params;
  const { school, user } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const [home, structure] = await Promise.all([
    getMemberHome(db, school.id, user.id),
    getSportsStructure(db, school.id),
  ]);
  const details = await asPortalUser(user.id, async () => {
    const ids = home.athletes.map((a) => a.id);
    const stats = await attendanceStats(db, school.id, ids, { from: addDays(today, -30), to: today });
    return Promise.all(
      home.athletes.map(async (a) => ({
        athlete: a,
        stats: stats.get(a.id),
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
      {details.length === 0 && (
        <Card className="text-center text-sm text-ink-soft">No hay alumnos vinculados a tu cuenta.</Card>
      )}
      {details.map(({ athlete: a, stats, history, documents }) => {
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
          </Card>
        );
      })}
    </div>
  );
}
