import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import {
  athletes,
  attendance,
  auditLogs,
  coaches,
  enrollments,
  groupCoaches,
  groups,
  schools,
  sessions,
} from "@/db/schema";
import { addDays, formatDayTitle, type IsoDate } from "@/lib/dates";
import { hhmm } from "@/modules/groups/schedule";
import { managerUserIds, notifyUsers } from "@/modules/notifications/notify";
import { loadRoster } from "./attendance";
import { attendanceRate } from "./planning";

/** Umbrales de deserción (DEP-26), configurables por escuela. */
export const attendancePolicySchema = z.object({
  consecutiveAbsences: z.number().int().min(2, "Mínimo 2").max(10, "Máximo 10"),
  minMonthlyRate: z.number().int().min(10, "Mínimo 10 %").max(100, "Máximo 100 %"),
});
export type AttendancePolicy = z.infer<typeof attendancePolicySchema>;
export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = { consecutiveAbsences: 3, minMonthlyRate: 50 };
/** Con menos registros en el mes no se juzga el porcentaje. */
export const MIN_RECORDS_FOR_RATE = 4;

export function readAttendancePolicy(raw: unknown): AttendancePolicy {
  const parsed = attendancePolicySchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ATTENDANCE_POLICY;
}

export async function updateAttendancePolicy(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  policy: AttendancePolicy,
) {
  await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx
      .update(schools)
      .set({
        settings: sql`jsonb_set(${schools.settings}, '{attendance}', ${JSON.stringify(policy)}::jsonb)`,
      })
      .where(eq(schools.id, ctx.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "attendance.policy_updated",
      entity: "school",
      entityId: ctx.schoolId,
      data: policy,
    });
  });
}

export type RiskReason = { kind: "streak"; absences: number } | { kind: "rate"; rate: number };
export type AtRiskAthlete = { athleteId: string; name: string; groupName: string; reasons: RiskReason[] };

/** Evalúa la racha de ausencias y el % del mes con los registros más recientes primero. */
export function riskReasons(
  records: { date: IsoDate; status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" }[],
  monthStart: IsoDate,
  policy: AttendancePolicy,
): RiskReason[] {
  const reasons: RiskReason[] = [];
  // Las excusas no rompen ni suman a la racha.
  const counted = records.filter((r) => r.status !== "EXCUSED");
  let streak = 0;
  for (const r of counted) {
    if (r.status !== "ABSENT") break;
    streak++;
  }
  if (streak >= policy.consecutiveAbsences) reasons.push({ kind: "streak", absences: streak });
  const month = records.filter((r) => r.date >= monthStart);
  const counts = {
    present: month.filter((r) => r.status === "PRESENT").length,
    late: month.filter((r) => r.status === "LATE").length,
    absent: month.filter((r) => r.status === "ABSENT").length,
    excused: month.filter((r) => r.status === "EXCUSED").length,
  };
  const rate = attendanceRate(counts);
  if (
    rate !== null &&
    counts.present + counts.late + counts.absent >= MIN_RECORDS_FOR_RATE &&
    rate < policy.minMonthlyRate
  ) {
    reasons.push({ kind: "rate", rate });
  }
  return reasons;
}

export const describeRisk = (r: RiskReason) =>
  r.kind === "streak" ? `${r.absences} ausencias seguidas` : `${r.rate} % de asistencia este mes`;

/** Alumnos activos en riesgo de deserción (DEP-26). */
export function atRiskAthletes(
  database: Database,
  schoolId: string,
  today: IsoDate,
  policy: AttendancePolicy,
): Promise<AtRiskAthlete[]> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const active = await tx
      .select({
        athleteId: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        groupName: groups.name,
      })
      .from(enrollments)
      .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
      .innerJoin(groups, eq(groups.id, enrollments.groupId))
      .where(eq(enrollments.status, "ACTIVE"));
    if (active.length === 0) return [];
    const monthStart = `${today.slice(0, 8)}01`;
    const from = monthStart < addDays(today, -60) ? monthStart : addDays(today, -60);
    const rows = await tx
      .select({ athleteId: attendance.athleteId, status: attendance.status, date: sessions.date })
      .from(attendance)
      .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
      .where(
        and(
          inArray(
            attendance.athleteId,
            active.map((a) => a.athleteId),
          ),
          eq(sessions.status, "SCHEDULED"),
          gte(sessions.date, from),
          lte(sessions.date, today),
        ),
      )
      .orderBy(desc(sessions.date), desc(sessions.startTime));
    const seen = new Set<string>();
    const result: AtRiskAthlete[] = [];
    for (const a of active) {
      if (seen.has(a.athleteId)) continue;
      seen.add(a.athleteId);
      const reasons = riskReasons(
        rows.filter((r) => r.athleteId === a.athleteId),
        monthStart,
        policy,
      );
      if (reasons.length) {
        result.push({
          athleteId: a.athleteId,
          name: `${a.firstName} ${a.lastName}`,
          groupName: a.groupName,
          reasons,
        });
      }
    }
    return result.sort((x, y) => x.name.localeCompare(y.name, "es"));
  });
}

/** Tarea diaria: avisa a la administración de cada alumno que entra en riesgo (una vez por mes y motivo). */
export async function notifyAtRisk(
  database: Database,
  school: { id: string; slug: string },
  today: IsoDate,
  policy: AttendancePolicy,
) {
  const list = await atRiskAthletes(database, school.id, today, policy);
  if (list.length === 0) return 0;
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    const managers = await managerUserIds(tx);
    let sent = 0;
    for (const a of list) {
      for (const reason of a.reasons) {
        sent += await notifyUsers(tx, school.id, managers, {
          kind: "attendance.risk",
          title: `${a.name} podría estar desertando`,
          body: `${describeRisk(reason)} en ${a.groupName}. Vale la pena llamar a la familia.`,
          href: `/${school.slug}/alumnos/${a.athleteId}`,
          dedupeKey: `attendance.risk:${a.athleteId}:${reason.kind}:${today.slice(0, 7)}`,
        });
      }
    }
    return sent;
  });
}

/**
 * Tarea diaria (DEP-27): recuerda a los profesores las clases de los últimos 2 días que terminaron
 * sin asistencia y tenían alumnos. Una vez por clase.
 */
export async function remindMissingAttendance(
  database: Database,
  school: { id: string; slug: string },
  today: IsoDate,
) {
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    const pending = await tx
      .select({ session: sessions, groupName: groups.name })
      .from(sessions)
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .where(
        and(
          eq(sessions.status, "SCHEDULED"),
          gte(sessions.date, addDays(today, -2)),
          lt(sessions.date, today),
          sql`not exists (select 1 from ${attendance} a where a.session_id = ${sessions.id})`,
        ),
      );
    let sent = 0;
    for (const { session, groupName } of pending) {
      if ((await loadRoster(tx, session)).length === 0) continue;
      const coachRows = await tx
        .select({ userId: coaches.userId })
        .from(coaches)
        .leftJoin(
          groupCoaches,
          and(eq(groupCoaches.coachId, coaches.id), eq(groupCoaches.groupId, session.groupId)),
        )
        .where(
          and(
            eq(coaches.active, true),
            session.substituteCoachId
              ? sql`(${groupCoaches.id} is not null or ${coaches.id} = ${session.substituteCoachId})`
              : sql`${groupCoaches.id} is not null`,
          ),
        );
      sent += await notifyUsers(
        tx,
        school.id,
        coachRows.map((c) => c.userId),
        {
          kind: "attendance.reminder",
          title: `Falta la asistencia de ${groupName}`,
          body: `La clase del ${formatDayTitle(session.date)} a las ${hhmm(session.startTime)} quedó sin registrar. Tienes hasta 48 horas después de la clase.`,
          href: `/${school.slug}/asistencia/${session.id}`,
          dedupeKey: `attendance.reminder:${session.id}`,
        },
      );
    }
    return sent;
  });
}
