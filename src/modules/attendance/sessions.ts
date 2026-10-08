import { and, asc, count, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  attendance,
  auditLogs,
  coaches,
  groupCoaches,
  groupSchedules,
  groups,
  schoolClosures,
  sessions,
} from "@/db/schema";
import { isoDateOf, type IsoDate } from "@/lib/dates";
import { hhmm } from "@/modules/groups/schedule";
import { planSessions, planningWindow, sessionKey, type PlanGroup } from "./planning";

type Ctx = { schoolId: string; actorUserId: string };

/**
 * Deja la tabla `sessions` alineada con los horarios (idempotente):
 * crea las clases que faltan desde 14 días atrás hasta 8 semanas adelante y, desde hoy,
 * borra las generadas por horario que ya no corresponden y no tienen asistencia.
 * El pasado y las clases con asistencia nunca se tocan.
 */
export function syncSessions(database: Database, school: { id: string; timezone: string }, today: IsoDate) {
  return runInTenant(database, { schoolId: school.id }, (tx) => syncInTx(tx, school, today));
}

export async function syncInTx(tx: Tx, school: { id: string; timezone: string }, today: IsoDate) {
  const { from, to } = planningWindow(today);
  const [groupRows, slots, closures, existing] = await Promise.all([
    tx.select({ id: groups.id, active: groups.active, createdAt: groups.createdAt }).from(groups),
    tx.select().from(groupSchedules),
    tx
      .select({
        startDate: schoolClosures.startDate,
        endDate: schoolClosures.endDate,
        reason: schoolClosures.reason,
      })
      .from(schoolClosures)
      .where(and(lte(schoolClosures.startDate, to), gte(schoolClosures.endDate, from))),
    tx
      .select({
        id: sessions.id,
        groupId: sessions.groupId,
        date: sessions.date,
        startTime: sessions.startTime,
        endTime: sessions.endTime,
        source: sessions.source,
      })
      .from(sessions)
      .where(and(gte(sessions.date, from), lte(sessions.date, to))),
  ]);
  const recorded = existing.length
    ? new Set(
        (
          await tx
            .selectDistinct({ sessionId: attendance.sessionId })
            .from(attendance)
            .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
            .where(and(gte(sessions.date, today), lte(sessions.date, to)))
        ).map((r) => r.sessionId),
      )
    : new Set<string>();

  const planGroups: PlanGroup[] = groupRows.map((g) => ({
    id: g.id,
    active: g.active,
    createdOn: isoDateOf(g.createdAt, school.timezone),
    schedule: slots
      .filter((s) => s.groupId === g.id)
      .map((s) => ({ weekday: s.weekday, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime) })),
  }));
  const planned = planSessions(planGroups, closures, from, to);
  const wanted = new Map(planned.map((p) => [sessionKey(p), p]));
  const have = new Map(existing.map((s) => [sessionKey(s), s]));

  const missing = planned.filter((p) => !have.has(sessionKey(p)));
  for (let i = 0; i < missing.length; i += 500) {
    await tx
      .insert(sessions)
      .values(missing.slice(i, i + 500).map((p) => ({ schoolId: school.id, ...p })))
      .onConflictDoNothing();
  }

  // Cambió la hora de salida de una franja: se ajustan las clases desde hoy.
  for (const s of existing) {
    const p = wanted.get(sessionKey(s));
    if (p && s.date >= today && hhmm(s.endTime) !== p.endTime) {
      await tx.update(sessions).set({ endTime: p.endTime }).where(eq(sessions.id, s.id));
    }
  }

  const stale = existing.filter(
    (s) => s.date >= today && s.source === "SCHEDULE" && !recorded.has(s.id) && !wanted.has(sessionKey(s)),
  );
  if (stale.length) {
    await tx.delete(sessions).where(
      inArray(
        sessions.id,
        stale.map((s) => s.id),
      ),
    );
  }
  return { created: missing.length, removed: stale.length };
}

const NONE = "00000000-0000-0000-0000-000000000000";

export type SessionItem = {
  id: string;
  groupId: string;
  groupName: string;
  groupColor: string;
  date: IsoDate;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "CANCELED";
  source: "SCHEDULE" | "EXTRA";
  cancelReason: string | null;
  note: string | null;
  /** Hay un profesor sustituto asignado. */
  substitute: boolean;
  recorded: number;
};

/**
 * Clases entre dos fechas. Con `coachUserId` solo las de los grupos donde esa persona es profesor
 * (titular o auxiliar).
 */
export function listSessions(
  database: Database,
  schoolId: string,
  range: { from: IsoDate; to: IsoDate },
  filter: { coachUserId?: string; groupIds?: string[] } = {},
): Promise<SessionItem[]> {
  return runInTenant(database, { schoolId }, async (tx) => {
    let mine: SQL | undefined;
    if (filter.coachUserId) {
      const myCoaches = await tx
        .select({ id: coaches.id })
        .from(coaches)
        .where(and(eq(coaches.userId, filter.coachUserId), eq(coaches.active, true)));
      if (myCoaches.length === 0) return [];
      const coachIds = myCoaches.map((c) => c.id);
      const rows = await tx
        .select({ groupId: groupCoaches.groupId })
        .from(groupCoaches)
        .where(inArray(groupCoaches.coachId, coachIds));
      // Sus grupos más las clases donde es sustituto.
      mine = or(
        rows.length
          ? inArray(
              sessions.groupId,
              rows.map((r) => r.groupId),
            )
          : undefined,
        inArray(sessions.substituteCoachId, coachIds),
      );
    }
    const rows = await tx
      .select({
        id: sessions.id,
        groupId: sessions.groupId,
        groupName: groups.name,
        groupColor: groups.color,
        date: sessions.date,
        startTime: sessions.startTime,
        endTime: sessions.endTime,
        status: sessions.status,
        source: sessions.source,
        cancelReason: sessions.cancelReason,
        note: sessions.note,
        substitute: sql<boolean>`${sessions.substituteCoachId} is not null`,
        recorded: count(attendance.id),
      })
      .from(sessions)
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .leftJoin(attendance, eq(attendance.sessionId, sessions.id))
      .where(
        and(
          gte(sessions.date, range.from),
          lte(sessions.date, range.to),
          mine,
          filter.groupIds
            ? inArray(sessions.groupId, filter.groupIds.length ? filter.groupIds : [NONE])
            : undefined,
        ),
      )
      .groupBy(sessions.id, groups.id)
      .orderBy(asc(sessions.date), asc(sessions.startTime), asc(groups.name));
    return rows.map((r) => ({ ...r, startTime: hhmm(r.startTime), endTime: hhmm(r.endTime) }));
  });
}

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Escribe el motivo (p. ej. lluvia, festivo, torneo)").max(120),
});

/** Cancela una clase (lluvia, festivo, torneo…). La asistencia ya tomada se conserva. */
export function cancelSession(database: Database, ctx: Ctx, sessionId: string, reason: string) {
  const input = cancelSchema.parse({ reason });
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .update(sessions)
      .set({ status: "CANCELED", cancelReason: input.reason })
      .where(eq(sessions.id, sessionId))
      .returning({ id: sessions.id, date: sessions.date, groupId: sessions.groupId });
    if (row) await audit(tx, ctx, "session.canceled", sessionId, { ...row, reason: input.reason });
    return Boolean(row);
  });
}

export function restoreSession(database: Database, ctx: Ctx, sessionId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .update(sessions)
      .set({ status: "SCHEDULED", cancelReason: null })
      .where(eq(sessions.id, sessionId))
      .returning({ id: sessions.id, date: sessions.date, groupId: sessions.groupId });
    if (row) await audit(tx, ctx, "session.restored", sessionId, row);
    return Boolean(row);
  });
}

async function audit(tx: Tx, ctx: Ctx, action: string, entityId: string, data: object) {
  await tx.insert(auditLogs).values({
    schoolId: ctx.schoolId,
    actorUserId: ctx.actorUserId,
    action,
    entity: "session",
    entityId,
    data,
  });
}
