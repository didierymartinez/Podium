import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  athletes,
  attendance,
  auditLogs,
  coaches,
  enrollments,
  groupCoaches,
  groups,
  sessions,
} from "@/db/schema";
import { instantOf, type IsoDate } from "@/lib/dates";
import { hhmm } from "@/modules/groups/schedule";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "./labels";
import { canRecordAttendance } from "./planning";

export { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, type AttendanceStatus } from "./labels";

export type RosterEntry = {
  athleteId: string;
  firstName: string;
  lastName: string;
  birthday: boolean;
  trial: boolean;
  status: AttendanceStatus | null;
  excuseReason: string | null;
};

export type SessionDetail = {
  id: string;
  date: IsoDate;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "CANCELED";
  cancelReason: string | null;
  group: { id: string; name: string; color: string };
  coachNames: string[];
  isGroupCoach: boolean;
  roster: RosterEntry[];
};

async function isCoachOf(tx: Tx, groupId: string, userId: string) {
  const [row] = await tx
    .select({ id: groupCoaches.id })
    .from(groupCoaches)
    .innerJoin(coaches, eq(coaches.id, groupCoaches.coachId))
    .where(and(eq(groupCoaches.groupId, groupId), eq(coaches.userId, userId), eq(coaches.active, true)))
    .limit(1);
  return Boolean(row);
}

/**
 * Lista de la clase: matriculados en el grupo en esa fecha (activos, preinscritos y retirados después
 * de la clase) más quien ya tenga registro. Los congelados no aparecen salvo que tengan registro.
 */
async function loadRoster(tx: Tx, groupId: string, sessionId: string, date: IsoDate): Promise<RosterEntry[]> {
  const [enrolled, records] = await Promise.all([
    tx
      .select({
        athleteId: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        birthDate: athletes.birthDate,
        status: enrollments.status,
      })
      .from(enrollments)
      .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
      .where(
        and(
          eq(enrollments.groupId, groupId),
          inArray(enrollments.status, ["ACTIVE", "PRE_ENROLLED", "WITHDRAWN"]),
          lte(enrollments.startDate, date),
          or(isNull(enrollments.endDate), gte(enrollments.endDate, date)),
        ),
      ),
    tx
      .select({
        athleteId: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        birthDate: athletes.birthDate,
        status: attendance.status,
        excuseReason: attendance.excuseReason,
      })
      .from(attendance)
      .innerJoin(athletes, eq(athletes.id, attendance.athleteId))
      .where(eq(attendance.sessionId, sessionId)),
  ]);

  const byId = new Map<string, RosterEntry>();
  const monthDay = date.slice(5);
  for (const e of enrolled) {
    const prev = byId.get(e.athleteId);
    byId.set(e.athleteId, {
      athleteId: e.athleteId,
      firstName: e.firstName,
      lastName: e.lastName,
      birthday: e.birthDate.slice(5) === monthDay,
      trial: Boolean(prev?.trial) || e.status === "PRE_ENROLLED",
      status: null,
      excuseReason: null,
    });
  }
  for (const r of records) {
    const entry = byId.get(r.athleteId) ?? {
      athleteId: r.athleteId,
      firstName: r.firstName,
      lastName: r.lastName,
      birthday: r.birthDate.slice(5) === monthDay,
      trial: false,
      status: null,
      excuseReason: null,
    };
    byId.set(r.athleteId, { ...entry, status: r.status, excuseReason: r.excuseReason });
  }
  return [...byId.values()].sort(
    (a, b) => a.firstName.localeCompare(b.firstName, "es") || a.lastName.localeCompare(b.lastName, "es"),
  );
}

export function getSessionDetail(
  database: Database,
  ctx: { schoolId: string; userId: string },
  sessionId: string,
): Promise<SessionDetail | null> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .select({ session: sessions, group: { id: groups.id, name: groups.name, color: groups.color } })
      .from(sessions)
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .where(eq(sessions.id, sessionId));
    if (!row) return null;
    const { session, group } = row;
    const [coachRows, isGroupCoach, roster] = await Promise.all([
      tx
        .select({ firstName: coaches.firstName, lastName: coaches.lastName })
        .from(groupCoaches)
        .innerJoin(coaches, eq(coaches.id, groupCoaches.coachId))
        .where(eq(groupCoaches.groupId, group.id))
        .orderBy(asc(groupCoaches.role)),
      isCoachOf(tx, group.id, ctx.userId),
      loadRoster(tx, group.id, session.id, session.date),
    ]);
    return {
      id: session.id,
      date: session.date,
      startTime: hhmm(session.startTime),
      endTime: hhmm(session.endTime),
      status: session.status,
      cancelReason: session.cancelReason,
      group,
      coachNames: coachRows.map((c) => `${c.firstName} ${c.lastName}`),
      isGroupCoach,
      roster,
    };
  });
}

export const attendanceSchema = z.object({
  entries: z
    .array(
      z
        .object({
          athleteId: z.uuid(),
          status: z.enum(ATTENDANCE_STATUSES),
          excuseReason: z.string().trim().max(120).nullish(),
        })
        .transform((e) => ({
          athleteId: e.athleteId,
          status: e.status,
          excuseReason: e.status === "EXCUSED" && e.excuseReason ? e.excuseReason : null,
        })),
    )
    .min(1, "Marca la asistencia de al menos un alumno")
    .max(500),
});

export type AttendanceInput = z.input<typeof attendanceSchema>;

export type SaveAttendanceResult =
  | { ok: true; saved: number }
  | {
      ok: false;
      error: "not_found" | "canceled" | "not_coach" | "too_early" | "window_closed" | "not_in_roster";
    };

/**
 * Guarda (o corrige) la asistencia de una clase. Administración siempre;
 * el profesor del grupo desde 1 h antes y hasta 48 h después de terminar.
 */
export function saveAttendance(
  database: Database,
  ctx: { schoolId: string; actorUserId: string; timeZone: string; isManager: boolean },
  sessionId: string,
  raw: AttendanceInput,
  now: Date = new Date(),
): Promise<SaveAttendanceResult> {
  const input = attendanceSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return { ok: false, error: "not_found" };
    if (session.status === "CANCELED") return { ok: false, error: "canceled" };

    const permission = canRecordAttendance({
      isManager: ctx.isManager,
      isGroupCoach: ctx.isManager ? false : await isCoachOf(tx, session.groupId, ctx.actorUserId),
      sessionStart: instantOf(session.date, session.startTime, ctx.timeZone),
      sessionEnd: instantOf(session.date, session.endTime, ctx.timeZone),
      now,
    });
    if (!permission.allowed) return { ok: false, error: permission.reason ?? "not_coach" };

    const roster = new Set(
      (await loadRoster(tx, session.groupId, session.id, session.date)).map((r) => r.athleteId),
    );
    if (input.entries.some((e) => !roster.has(e.athleteId))) return { ok: false, error: "not_in_roster" };

    await tx
      .insert(attendance)
      .values(
        input.entries.map((e) => ({
          schoolId: ctx.schoolId,
          sessionId,
          athleteId: e.athleteId,
          status: e.status,
          excuseReason: e.excuseReason,
          recordedByUserId: ctx.actorUserId,
        })),
      )
      .onConflictDoUpdate({
        target: [attendance.sessionId, attendance.athleteId],
        set: {
          status: sql`excluded.status`,
          excuseReason: sql`excluded.excuse_reason`,
          recordedByUserId: sql`excluded.recorded_by_user_id`,
          updatedAt: sql`now()`,
        },
      });

    const totals = Object.fromEntries(
      ATTENDANCE_STATUSES.map((s) => [s, input.entries.filter((e) => e.status === s).length]),
    );
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "attendance.recorded",
      entity: "session",
      entityId: sessionId,
      data: { date: session.date, groupId: session.groupId, totals },
    });
    return { ok: true, saved: input.entries.length };
  });
}
