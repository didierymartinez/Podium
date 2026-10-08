import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { attendance, auditLogs, groups, guardians, sessions } from "@/db/schema";
import { instantOf } from "@/lib/dates";
import { loadRoster } from "./attendance";

/** Check-in con QR (DEP-25): la familia escanea el QR de la clase y registra la llegada. */

/** Ventana: desde 30 min antes del inicio hasta el final; después de 10 min del inicio es "tarde". */
export const CHECK_IN_EARLY_MINUTES = 30;
export const LATE_AFTER_MINUTES = 10;

/** Firma del link de cada clase: sin ella no se puede hacer check-in en otra clase adivinando el id. */
export function checkInToken(secret: string, sessionId: string) {
  return createHmac("sha256", secret).update(`checkin:${sessionId}`).digest("base64url").slice(0, 22);
}

export function validCheckInToken(secret: string, sessionId: string, token: string | null | undefined) {
  const expected = Buffer.from(checkInToken(secret, sessionId));
  const given = Buffer.from(token ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type CheckInView =
  | {
      ok: true;
      session: { id: string; date: string; startTime: string; endTime: string; groupName: string };
      window: "open" | "early" | "closed";
      athletes: { id: string; name: string; status: string | null }[];
    }
  | { ok: false; error: "not_found" | "canceled" };

function windowOf(
  session: { date: string; startTime: string; endTime: string },
  timeZone: string,
  now: Date,
) {
  const start = instantOf(session.date, session.startTime, timeZone).getTime();
  const end = instantOf(session.date, session.endTime, timeZone).getTime();
  if (now.getTime() < start - CHECK_IN_EARLY_MINUTES * 60_000) return "early" as const;
  if (now.getTime() > end) return "closed" as const;
  return "open" as const;
}

/** Datos de la página de check-in. Va dentro de `asPortalUser`: la lista solo trae a los hijos de la familia. */
export function checkInView(
  database: Database,
  schoolId: string,
  sessionId: string,
  timeZone: string,
  now: Date,
): Promise<CheckInView> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx
      .select({ session: sessions, groupName: groups.name })
      .from(sessions)
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .where(eq(sessions.id, sessionId));
    if (!row) return { ok: false, error: "not_found" };
    if (row.session.status === "CANCELED") return { ok: false, error: "canceled" };
    const roster = await loadRoster(tx, row.session);
    const ids = roster.map((r) => r.athleteId);
    const marks = ids.length
      ? await tx
          .select({ athleteId: attendance.athleteId, status: attendance.status })
          .from(attendance)
          .where(and(eq(attendance.sessionId, sessionId), inArray(attendance.athleteId, ids)))
      : [];
    return {
      ok: true,
      session: {
        id: row.session.id,
        date: row.session.date,
        startTime: row.session.startTime.slice(0, 5),
        endTime: row.session.endTime.slice(0, 5),
        groupName: row.groupName,
      },
      window: windowOf(row.session, timeZone, now),
      athletes: roster.map((r) => ({
        id: r.athleteId,
        name: `${r.firstName} ${r.lastName}`,
        status: marks.find((m) => m.athleteId === r.athleteId)?.status ?? null,
      })),
    };
  });
}

export type CheckInResult =
  | { ok: true; checkedIn: number; status: "PRESENT" | "LATE" }
  | { ok: false; error: "not_found" | "canceled" | "early" | "closed" | "not_in_roster" };

/**
 * Registra la llegada (Presente o Tarde según la hora). No pisa lo que el profesor ya marcó. Va dentro de
 * `asPortalUser`: RLS solo deja escribir la asistencia de los hijos de la familia.
 */
export function checkIn(
  database: Database,
  ctx: { schoolId: string; userId: string; timeZone: string },
  sessionId: string,
  athleteIds: string[],
  now: Date,
): Promise<CheckInResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return { ok: false, error: "not_found" };
    if (session.status === "CANCELED") return { ok: false, error: "canceled" };
    const window = windowOf(session, ctx.timeZone, now);
    if (window !== "open") return { ok: false, error: window };
    const roster = new Set((await loadRoster(tx, session)).map((r) => r.athleteId));
    if (athleteIds.length === 0 || athleteIds.some((id) => !roster.has(id)))
      return { ok: false, error: "not_in_roster" };
    const start = instantOf(session.date, session.startTime, ctx.timeZone).getTime();
    const status =
      now.getTime() > start + LATE_AFTER_MINUTES * 60_000 ? ("LATE" as const) : ("PRESENT" as const);
    const inserted = await tx
      .insert(attendance)
      .values(
        athleteIds.map((athleteId) => ({
          schoolId: ctx.schoolId,
          sessionId,
          athleteId,
          status,
          recordedByUserId: ctx.userId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing()
      .returning({ athleteId: attendance.athleteId });
    if (inserted.length)
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.userId,
        action: "attendance.check_in",
        entity: "session",
        entityId: sessionId,
        data: { athletes: inserted.map((i) => i.athleteId), status },
      });
    return { ok: true, checkedIn: inserted.length, status };
  });
}

/** Llegadas que marcaron las familias en una clase (registros hechos por usuarios acudientes). */
export function checkInCount(database: Database, schoolId: string, sessionId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .selectDistinct({ athleteId: attendance.athleteId })
      .from(attendance)
      .innerJoin(guardians, eq(guardians.userId, attendance.recordedByUserId))
      .where(eq(attendance.sessionId, sessionId));
    return rows.length;
  });
}
