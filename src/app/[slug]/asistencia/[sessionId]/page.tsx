import { Clock, PartyPopper, UserRoundCog, Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Alert, Card, Chip } from "@/components/ui";
import { db } from "@/db/client";
import { formatDayTitle, instantOf, todayIn } from "@/lib/dates";
import { holidaysBetween } from "@/lib/holidays-co";
import { getSessionDetail } from "@/modules/attendance/attendance";
import { makeupCandidates } from "@/modules/attendance/family";
import { canManagePeople } from "@/modules/schools/permissions";
import { listCoaches } from "@/modules/coaches/coaches";
import { fileHref } from "@/modules/files/files";
import { readBillingPolicy } from "@/modules/billing/policy";
import { athleteBillingStatus } from "@/modules/billing/statement";
import { getSchoolContext } from "../../data";
import { SessionStatusChip } from "../status-chip";
import { CancelPanel } from "./cancel-panel";
import { RosterForm } from "./roster-form";
import { InjuryCard, MakeupCard } from "./session-extras";
import { SessionPlanCard } from "./session-plan";
import { sessionPlan } from "@/modules/training/training";

export const metadata: Metadata = { title: "Tomar asistencia" };

export default async function SessionPage({ params }: PageProps<"/[slug]/asistencia/[sessionId]">) {
  const { slug, sessionId } = await params;
  const { school, user, roles } = await getSchoolContext(slug);
  const manager = canManagePeople(roles);
  if (!manager && !roles.includes("COACH")) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound();

  const session = await getSessionDetail(db, { schoolId: school.id, userId: user.id }, sessionId);
  if (!session || (!manager && !session.isGroupCoach)) notFound();

  const today = todayIn(school.timezone);
  const canceled = session.status === "CANCELED";
  const holiday = holidaysBetween(session.date, session.date).get(session.date);
  const recorded = session.roster.filter((r) => r.status).length;
  // ADM-43: la mora se muestra a la administración y, si la escuela lo permite, al profesor.
  const showDebt = manager || readBillingPolicy(school.settings.billing).showDebtToCoaches;
  const debts = showDebt
    ? await athleteBillingStatus(
        db,
        school.id,
        session.roster.map((r) => r.athleteId),
        today,
      )
    : new Map<string, { overdue: boolean }>();
  const day = await sessionPlan(db, school.id, session.id);

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/asistencia?fecha=${session.date}`, label: "Clases del día" }}
        title={
          <span className="flex items-center gap-3">
            <span
              className="size-3.5 shrink-0 rounded-full"
              style={{ background: session.group.color }}
              aria-hidden
            />
            {session.group.name}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="capitalize">{formatDayTitle(session.date)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {session.startTime} – {session.endTime}
            </span>
            {session.coachNames.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> {session.coachNames.join(", ")}
              </span>
            )}
            {session.substitute && (
              <span className="inline-flex items-center gap-1 font-semibold text-violet">
                <UserRoundCog className="size-3.5" /> Sustituto: {session.substitute.name}
              </span>
            )}
          </span>
        }
        actions={<SessionStatusChip session={{ ...session, recorded }} today={today} />}
      />

      {(session.source === "EXTRA" || session.note) && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {session.source === "EXTRA" && <Chip tone="violet">Clase extra</Chip>}
          {session.selectedAthletes && <Chip>Solo alumnos citados</Chip>}
          {session.note && <span className="text-sm text-ink-soft">{session.note}</span>}
          {session.rescheduledFrom && (
            <Link
              href={`/${slug}/asistencia/${session.rescheduledFrom.id}`}
              className="text-sm font-semibold text-brand"
            >
              Ver clase original
            </Link>
          )}
        </div>
      )}
      {holiday && (
        <div className="flex items-center gap-3 rounded-2xl bg-sun/30 px-4 py-3 text-sm">
          <PartyPopper className="size-4 shrink-0" /> Festivo: {holiday} (solo referencia).
        </div>
      )}
      {canceled && (
        <Alert>
          Clase cancelada{session.cancelReason ? `: ${session.cancelReason}` : ""}. No se toma asistencia.
          {session.rescheduledTo && (
            <>
              {" "}
              <Link
                href={`/${slug}/asistencia/${session.rescheduledTo.id}`}
                className="font-semibold underline"
              >
                Ir a la clase nueva
              </Link>
            </>
          )}
        </Alert>
      )}

      {!canceled && day && (
        <SessionPlanCard
          slug={slug}
          sessionId={session.id}
          plan={day.plan && { id: day.plan.id, name: day.plan.name, objective: day.plan.objective }}
          items={day.items.map((i) => ({
            id: i.id,
            title: i.title,
            phase: i.phase,
            minutes: i.minutes,
            notes: i.notes,
          }))}
          report={
            day.report && {
              fulfilled: day.report.fulfilled,
              rpe: day.report.rpe,
              minutes: day.report.minutes,
              notes: day.report.notes,
            }
          }
          duration={day.duration}
        />
      )}

      {session.roster.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">No hay alumnos matriculados en esta fecha</p>
          <p className="mt-1 text-sm text-ink-soft">Matricula alumnos en el grupo para tomar asistencia.</p>
        </Card>
      ) : (
        <RosterForm
          slug={slug}
          sessionId={session.id}
          roster={session.roster.map((r) => ({
            ...r,
            photoUrl: r.photoFileId ? fileHref(slug, r.photoFileId) : null,
            documentIssue: manager ? r.documentIssue : null,
            overdue: debts.get(r.athleteId)?.overdue ?? false,
          }))}
          canceled={canceled}
          access={{
            isManager: manager,
            isGroupCoach: session.isGroupCoach,
            start: instantOf(session.date, session.startTime, school.timezone).toISOString(),
            end: instantOf(session.date, session.endTime, school.timezone).toISOString(),
          }}
        />
      )}

      {!canceled && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MakeupCard
            slug={slug}
            sessionId={session.id}
            makeups={session.roster
              .filter((r) => r.makeup)
              .map((r) => ({
                athleteId: r.athleteId,
                name: `${r.firstName} ${r.lastName}`,
                recorded: Boolean(r.status),
              }))}
            candidates={(await makeupCandidates(db, school.id, session.id)).map((c) => ({
              id: c.id,
              name: `${c.firstName} ${c.lastName}`,
              groupName: c.groupName,
            }))}
          />
          {session.roster.length > 0 && (
            <InjuryCard
              slug={slug}
              sessionId={session.id}
              today={today}
              athletes={session.roster.map((r) => ({
                id: r.athleteId,
                name: `${r.firstName} ${r.lastName}`,
              }))}
            />
          )}
        </div>
      )}

      {manager && (
        <CancelPanel
          slug={slug}
          sessionId={session.id}
          canceled={canceled}
          reason={session.cancelReason}
          rescheduled={Boolean(session.rescheduledTo)}
          session={session}
          substituteId={session.substitute?.id ?? null}
          coaches={(await listCoaches(db, school.id))
            .filter((c) => c.active)
            .map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))}
        />
      )}
    </div>
  );
}
