import { Clock, PartyPopper, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Alert, Card } from "@/components/ui";
import { db } from "@/db/client";
import { formatDayTitle, instantOf, todayIn } from "@/lib/dates";
import { holidaysBetween } from "@/lib/holidays-co";
import { getSessionDetail } from "@/modules/attendance/attendance";
import { canRecordAttendance } from "@/modules/attendance/planning";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { SessionStatusChip } from "../status-chip";
import { CancelPanel } from "./cancel-panel";
import { RosterForm } from "./roster-form";

export const metadata: Metadata = { title: "Tomar asistencia" };

const BLOCKED: Record<string, string> = {
  not_coach: "Solo los profesores de este grupo pueden tomar la asistencia.",
  too_early: "La asistencia se abre 1 hora antes de la clase.",
  window_closed: "Pasaron más de 48 horas desde la clase: solo la administración puede corregirla.",
};

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
  const permission = canRecordAttendance({
    isManager: manager,
    isGroupCoach: session.isGroupCoach,
    sessionStart: instantOf(session.date, session.startTime, school.timezone),
    sessionEnd: instantOf(session.date, session.endTime, school.timezone),
    now: new Date(),
  });
  const holiday = holidaysBetween(session.date, session.date).get(session.date);
  const recorded = session.roster.filter((r) => r.status).length;

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
          </span>
        }
        actions={<SessionStatusChip session={{ ...session, recorded }} today={today} />}
      />

      {holiday && (
        <div className="flex items-center gap-3 rounded-2xl bg-sun/30 px-4 py-3 text-sm">
          <PartyPopper className="size-4 shrink-0" /> Festivo: {holiday} (solo referencia).
        </div>
      )}
      {canceled && (
        <Alert>
          Clase cancelada{session.cancelReason ? `: ${session.cancelReason}` : ""}. No se toma asistencia.
        </Alert>
      )}
      {!canceled && !permission.allowed && permission.reason && (
        <Alert tone="info">{BLOCKED[permission.reason]}</Alert>
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
          roster={session.roster}
          readOnly={canceled || !permission.allowed}
        />
      )}

      {manager && (
        <CancelPanel slug={slug} sessionId={session.id} canceled={canceled} reason={session.cancelReason} />
      )}
    </div>
  );
}
