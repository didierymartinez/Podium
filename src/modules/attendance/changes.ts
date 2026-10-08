import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { allVisible } from "@/db/ownership";
import { pgErrorCode, runInTenant, type Database, type Tx } from "@/db/rls";
import { athletes, auditLogs, coaches, enrollments, groups, sessionAthletes, sessions } from "@/db/schema";
import { formatDayTitle } from "@/lib/dates";
import { hhmm } from "@/modules/groups/schedule";
import { familyUserIds, notifyUsers } from "@/modules/notifications/notify";

type Ctx = { schoolId: string; actorUserId: string; slug: string };

const time = z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida");
const slotSchema = z
  .object({ date: z.iso.date("Escribe la fecha"), startTime: time, endTime: time })
  .refine((s) => s.endTime > s.startTime, { message: "La hora final debe ser posterior", path: ["endTime"] });

export const rescheduleSchema = slotSchema.and(z.object({ reason: z.string().trim().max(120).nullable() }));
export const extraSessionSchema = slotSchema.and(
  z.object({
    groupId: z.uuid("Elige el grupo"),
    note: z.string().trim().max(120).nullable(),
    athleteIds: z.array(z.uuid()).max(200).default([]),
  }),
);

export type ChangeError = "not_found" | "slot_taken" | "invalid_reference" | "canceled";

/** Familias (acudientes y alumnos con cuenta) citadas a una clase. */
async function sessionFamilies(tx: Tx, session: { id: string; groupId: string; date: string }) {
  const selected = await tx
    .select({ athleteId: sessionAthletes.athleteId })
    .from(sessionAthletes)
    .where(eq(sessionAthletes.sessionId, session.id));
  const athleteIds =
    selected.length > 0
      ? selected.map((s) => s.athleteId)
      : (
          await tx
            .select({ athleteId: enrollments.athleteId })
            .from(enrollments)
            .where(
              and(
                eq(enrollments.groupId, session.groupId),
                inArray(enrollments.status, ["ACTIVE", "PRE_ENROLLED"]),
                lte(enrollments.startDate, session.date),
                or(isNull(enrollments.endDate), gte(enrollments.endDate, session.date)),
              ),
            )
        ).map((e) => e.athleteId);
  return familyUserIds(tx, athleteIds);
}

const when = (date: string, start: string) => `${formatDayTitle(date)} a las ${hhmm(start)}`;

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

/** Avisa a las familias que una clase se canceló (se llama después de `cancelSession`). */
export function notifyCancellation(database: Database, ctx: Ctx, sessionId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .select({ session: sessions, groupName: groups.name })
      .from(sessions)
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .where(eq(sessions.id, sessionId));
    if (!row || row.session.status !== "CANCELED") return 0;
    return notifyUsers(tx, ctx.schoolId, await sessionFamilies(tx, row.session), {
      kind: "session.canceled",
      title: `Se canceló la clase de ${row.groupName}`,
      body: `${when(row.session.date, row.session.startTime)}. Motivo: ${row.session.cancelReason ?? "sin motivo"}.`,
      href: `/${ctx.slug}`,
    });
  });
}

/**
 * Reprograma una clase: la original queda cancelada ("Reprogramada") y se crea una clase extra en la
 * nueva fecha y hora, con los mismos alumnos citados y el mismo sustituto. Avisa a las familias.
 */
export function rescheduleSession(
  database: Database,
  ctx: Ctx,
  sessionId: string,
  raw: z.input<typeof rescheduleSchema>,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: ChangeError }> {
  const input = rescheduleSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .select({ session: sessions, groupName: groups.name })
      .from(sessions)
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .where(eq(sessions.id, sessionId));
    if (!row) return { ok: false as const, error: "not_found" as const };
    const original = row.session;
    if (original.status === "CANCELED") return { ok: false as const, error: "canceled" as const };
    const [created] = await tx
      .insert(sessions)
      .values({
        schoolId: ctx.schoolId,
        groupId: original.groupId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        source: "EXTRA",
        substituteCoachId: original.substituteCoachId,
        note: `Reprogramada del ${formatDayTitle(original.date)}`,
      })
      .returning({ id: sessions.id });
    const selected = await tx
      .select()
      .from(sessionAthletes)
      .where(eq(sessionAthletes.sessionId, original.id));
    if (selected.length) {
      await tx
        .insert(sessionAthletes)
        .values(
          selected.map((s) => ({ schoolId: ctx.schoolId, sessionId: created.id, athleteId: s.athleteId })),
        );
    }
    const reason = input.reason || `Reprogramada para el ${formatDayTitle(input.date)}`;
    await tx
      .update(sessions)
      .set({ status: "CANCELED", cancelReason: reason, rescheduledToId: created.id })
      .where(eq(sessions.id, original.id));
    await audit(tx, ctx, "session.rescheduled", original.id, { to: created.id, ...input });
    await notifyUsers(tx, ctx.schoolId, await sessionFamilies(tx, original), {
      kind: "session.rescheduled",
      title: `Cambio de horario en ${row.groupName}`,
      body: `La clase del ${when(original.date, original.startTime)} pasa al ${when(input.date, input.startTime)}.`,
      href: `/${ctx.slug}`,
    });
    return { ok: true as const, sessionId: created.id };
  }).catch((err) => {
    if (pgErrorCode(err) === "23505") return { ok: false as const, error: "slot_taken" as const };
    throw err;
  });
}

/** Clase extra (reposición, preparación de torneo…) para todo el grupo o para alumnos citados. */
export function createExtraSession(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof extraSessionSchema>,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: ChangeError }> {
  const input = extraSessionSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const athleteIds = [...new Set(input.athleteIds)];
    if (!(await allVisible(tx, groups, [input.groupId])) || !(await allVisible(tx, athletes, athleteIds))) {
      return { ok: false as const, error: "invalid_reference" as const };
    }
    const [created] = await tx
      .insert(sessions)
      .values({
        schoolId: ctx.schoolId,
        groupId: input.groupId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        source: "EXTRA",
        note: input.note,
      })
      .returning();
    if (athleteIds.length) {
      await tx
        .insert(sessionAthletes)
        .values(
          athleteIds.map((athleteId) => ({ schoolId: ctx.schoolId, sessionId: created.id, athleteId })),
        );
    }
    const [group] = await tx.select({ name: groups.name }).from(groups).where(eq(groups.id, input.groupId));
    await audit(tx, ctx, "session.extra_created", created.id, input);
    await notifyUsers(tx, ctx.schoolId, await sessionFamilies(tx, created), {
      kind: "session.extra",
      title: `Clase extra de ${group.name}`,
      body: `${when(input.date, input.startTime)}${input.note ? `. ${input.note}` : ""}.`,
      href: `/${ctx.slug}`,
    });
    return { ok: true as const, sessionId: created.id };
  }).catch((err) => {
    if (pgErrorCode(err) === "23505") return { ok: false as const, error: "slot_taken" as const };
    throw err;
  });
}

/** Asigna (o quita) un profesor sustituto para una clase y le avisa. */
export function setSubstitute(
  database: Database,
  ctx: Ctx,
  sessionId: string,
  coachId: string | null,
): Promise<boolean> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    let coachUserId: string | null = null;
    if (coachId) {
      const [coach] = await tx
        .select({ userId: coaches.userId, active: coaches.active })
        .from(coaches)
        .where(eq(coaches.id, coachId));
      if (!coach?.active) return false;
      coachUserId = coach.userId;
    }
    const [row] = await tx
      .update(sessions)
      .set({ substituteCoachId: coachId })
      .where(eq(sessions.id, sessionId))
      .returning();
    if (!row) return false;
    await audit(tx, ctx, "session.substitute", sessionId, { coachId });
    const [group] = await tx.select({ name: groups.name }).from(groups).where(eq(groups.id, row.groupId));
    await notifyUsers(tx, ctx.schoolId, [coachUserId], {
      kind: "session.substitute",
      title: `Te asignaron una clase de ${group.name}`,
      body: `Reemplazo el ${when(row.date, row.startTime)}.`,
      href: `/${ctx.slug}/asistencia/${row.id}`,
    });
    return true;
  });
}
