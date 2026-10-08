import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
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
  sessionAthletes,
  sessions,
} from "@/db/schema";
import { addDays, formatDayTitle, instantOf, type IsoDate } from "@/lib/dates";
import { hhmm } from "@/modules/groups/schedule";
import { notifyUsers, type NotificationInput } from "@/modules/notifications/notify";
import { loadRoster } from "./attendance";

/** Excusas del acudiente (DEP-23) y clases de reposición (DEP-24). */

async function sessionCoachUserIds(tx: Tx, session: { groupId: string; substituteCoachId: string | null }) {
  const rows = await tx
    .select({ userId: coaches.userId })
    .from(coaches)
    .leftJoin(
      groupCoaches,
      and(eq(groupCoaches.coachId, coaches.id), eq(groupCoaches.groupId, session.groupId)),
    )
    .where(
      session.substituteCoachId
        ? sql`${groupCoaches.id} is not null or ${coaches.id} = ${session.substituteCoachId}`
        : sql`${groupCoaches.id} is not null`,
    );
  return rows.map((r) => r.userId);
}

export type UpcomingClass = {
  sessionId: string;
  date: IsoDate;
  startTime: string;
  groupName: string;
  /** Excusa ya reportada (y si fue la familia quien la reportó). */
  excused: boolean;
  familyReported: boolean;
  /** La asistencia ya la tomó la escuela: la familia no puede cambiarla. */
  recorded: boolean;
};

/**
 * Próximas clases de cada hijo (7 días) que aún no empiezan, con su estado de excusa.
 * Se llama dentro de `asPortalUser`, así que RLS limita a los hijos de la persona.
 */
export function upcomingForFamily(
  database: Database,
  schoolId: string,
  athleteIds: string[],
  today: IsoDate,
  now: Date,
  timeZone: string,
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const result = new Map<string, UpcomingClass[]>();
    if (athleteIds.length === 0) return result;
    const enrolled = await tx
      .select({ athleteId: enrollments.athleteId, groupId: enrollments.groupId })
      .from(enrollments)
      .where(and(inArray(enrollments.athleteId, athleteIds), eq(enrollments.status, "ACTIVE")));
    const groupIds = [...new Set(enrolled.map((e) => e.groupId))];
    if (groupIds.length === 0) return result;
    const rows = await tx
      .select({ session: sessions, groupName: groups.name })
      .from(sessions)
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .where(
        and(
          inArray(sessions.groupId, groupIds),
          eq(sessions.status, "SCHEDULED"),
          gte(sessions.date, today),
          lte(sessions.date, addDays(today, 6)),
        ),
      )
      .orderBy(asc(sessions.date), asc(sessions.startTime));
    const marks = rows.length
      ? await tx
          .select()
          .from(attendance)
          .where(
            and(
              inArray(
                attendance.sessionId,
                rows.map((r) => r.session.id),
              ),
              inArray(attendance.athleteId, athleteIds),
            ),
          )
      : [];
    for (const { athleteId, groupId } of enrolled) {
      const list = rows
        .filter((r) => r.session.groupId === groupId)
        .filter((r) => instantOf(r.session.date, r.session.startTime, timeZone) > now)
        .map((r) => {
          const mark = marks.find((m) => m.sessionId === r.session.id && m.athleteId === athleteId);
          return {
            sessionId: r.session.id,
            date: r.session.date,
            startTime: hhmm(r.session.startTime),
            groupName: r.groupName,
            excused: mark?.status === "EXCUSED",
            familyReported: Boolean(mark?.familyReported),
            recorded: Boolean(mark && !mark.familyReported),
          };
        });
      result.set(athleteId, [...(result.get(athleteId) ?? []), ...list]);
    }
    return result;
  });
}

export const excuseSchema = z.object({ reason: z.string().trim().min(3, "Cuéntanos el motivo").max(120) });

export type ExcuseError = "not_found" | "started" | "recorded" | "not_in_roster";
export type ExcuseNotice = { userIds: (string | null)[]; input: NotificationInput };

/** Avisa a los profesores de la clase (se llama fuera de `asPortalUser`). */
export function sendExcuseNotice(database: Database, schoolId: string, notice: ExcuseNotice) {
  return runInTenant(database, { schoolId }, (tx) => notifyUsers(tx, schoolId, notice.userIds, notice.input));
}

/**
 * El acudiente reporta una excusa antes de la clase: queda pre-marcada como Excusa y se avisa al profesor.
 * Va dentro de `asPortalUser` (RLS: solo sus hijos).
 */
export function reportExcuse(
  database: Database,
  ctx: { schoolId: string; userId: string; timeZone: string; slug: string },
  input: { sessionId: string; athleteId: string; reason: string },
  now: Date,
): Promise<{ ok: true; notice: ExcuseNotice } | { ok: false; error: ExcuseError }> {
  const { reason } = excuseSchema.parse({ reason: input.reason });
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [[session], [athlete]] = await Promise.all([
      tx.select().from(sessions).where(eq(sessions.id, input.sessionId)),
      tx.select().from(athletes).where(eq(athletes.id, input.athleteId)),
    ]);
    if (!session || !athlete || session.status === "CANCELED")
      return { ok: false as const, error: "not_found" as const };
    if (instantOf(session.date, session.startTime, ctx.timeZone) <= now)
      return { ok: false as const, error: "started" as const };
    const roster = await loadRoster(tx, session);
    if (!roster.some((r) => r.athleteId === athlete.id))
      return { ok: false as const, error: "not_in_roster" as const };
    const [existing] = await tx
      .select()
      .from(attendance)
      .where(and(eq(attendance.sessionId, session.id), eq(attendance.athleteId, athlete.id)));
    if (existing && !existing.familyReported) return { ok: false as const, error: "recorded" as const };
    await tx
      .insert(attendance)
      .values({
        schoolId: ctx.schoolId,
        sessionId: session.id,
        athleteId: athlete.id,
        status: "EXCUSED",
        excuseReason: reason,
        recordedByUserId: ctx.userId,
        familyReported: true,
      })
      .onConflictDoUpdate({
        target: [attendance.sessionId, attendance.athleteId],
        set: { excuseReason: reason, updatedAt: now },
      });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.userId,
      action: "attendance.excuse_reported",
      entity: "session",
      entityId: session.id,
      data: { athleteId: athlete.id, reason },
    });
    const [group] = await tx.select({ name: groups.name }).from(groups).where(eq(groups.id, session.groupId));
    // El aviso al profesor se envía fuera del contexto de familia (RLS de notificaciones).
    const notice: ExcuseNotice = {
      userIds: await sessionCoachUserIds(tx, session),
      input: {
        kind: "attendance.excuse",
        title: `${athlete.firstName} ${athlete.lastName} no asistirá`,
        body: `${formatDayTitle(session.date)} · ${hhmm(session.startTime)} · ${group?.name ?? ""}. Motivo: ${reason}`,
        href: `/${ctx.slug}/asistencia/${session.id}`,
        dedupeKey: `excuse:${session.id}:${athlete.id}`,
      },
    };
    return { ok: true as const, notice };
  });
}

/** La familia retira su excusa antes de la clase (solo si la asistencia no se ha tomado). */
export function withdrawExcuse(
  database: Database,
  ctx: { schoolId: string; userId: string; timeZone: string },
  input: { sessionId: string; athleteId: string },
  now: Date,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, input.sessionId));
    if (!session || instantOf(session.date, session.startTime, ctx.timeZone) <= now) return false;
    const deleted = await tx
      .delete(attendance)
      .where(
        and(
          eq(attendance.sessionId, input.sessionId),
          eq(attendance.athleteId, input.athleteId),
          eq(attendance.familyReported, true),
        ),
      )
      .returning({ id: attendance.id });
    return deleted.length > 0;
  });
}

/** Alumnos activos de otros grupos que pueden venir a reponer a esta clase. */
export function makeupCandidates(database: Database, schoolId: string, sessionId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return [];
    const inRoster = new Set((await loadRoster(tx, session)).map((r) => r.athleteId));
    const rows = await tx
      .selectDistinct({
        id: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        groupName: groups.name,
      })
      .from(enrollments)
      .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
      .innerJoin(groups, eq(groups.id, enrollments.groupId))
      .where(eq(enrollments.status, "ACTIVE"))
      .orderBy(asc(athletes.firstName), asc(athletes.lastName));
    const seen = new Set<string>();
    return rows.filter((r) => !inRoster.has(r.id) && !seen.has(r.id) && seen.add(r.id));
  });
}

/** Suma un alumno de otro grupo a la clase como reposición; su asistencia cuenta para él. */
export function addMakeup(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  sessionId: string,
  athleteId: string,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session || session.status === "CANCELED") return false;
    const [active] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.athleteId, athleteId), eq(enrollments.status, "ACTIVE")))
      .limit(1);
    if (!active) return false;
    await tx
      .insert(sessionAthletes)
      .values({ schoolId: ctx.schoolId, sessionId, athleteId, makeup: true })
      .onConflictDoNothing();
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "session.makeup_added",
      entity: "session",
      entityId: sessionId,
      data: { athleteId },
    });
    return true;
  });
}

/** Quita una reposición si aún no tiene asistencia registrada. */
export function removeMakeup(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  sessionId: string,
  athleteId: string,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [mark] = await tx
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(eq(attendance.sessionId, sessionId), eq(attendance.athleteId, athleteId)));
    if (mark) return false;
    const deleted = await tx
      .delete(sessionAthletes)
      .where(
        and(
          eq(sessionAthletes.sessionId, sessionId),
          eq(sessionAthletes.athleteId, athleteId),
          eq(sessionAthletes.makeup, true),
        ),
      )
      .returning({ id: sessionAthletes.id });
    return deleted.length > 0;
  });
}
