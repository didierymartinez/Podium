import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { pgErrorCode, runInTenant, type Database } from "@/db/rls";
import { auditLogs, cashClosings, guardians, payments, users } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";

/** Cierre de caja diario por usuario (ADM-50). */

export const MANUAL_METHODS = ["CASH", "TRANSFER", "DEPOSIT", "CARD"] as const;

/** Pagos manuales que registró la persona ese día (hora de la escuela), confirmados. */
export function cashDraft(
  database: Database,
  schoolId: string,
  userId: string,
  date: IsoDate,
  timeZone: string,
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({
        id: payments.id,
        code: payments.code,
        amount: payments.amount,
        method: payments.method,
        guardianName: sql<string>`${guardians.firstName} || ' ' || ${guardians.lastName}`,
      })
      .from(payments)
      .innerJoin(guardians, eq(guardians.id, payments.guardianId))
      .where(
        and(
          eq(payments.recordedByUserId, userId),
          eq(payments.status, "CONFIRMED"),
          ne(payments.method, "ONLINE"),
          sql`(${payments.createdAt} at time zone ${timeZone})::date = ${date}`,
        ),
      )
      .orderBy(payments.number);
    const expected = Object.fromEntries(
      MANUAL_METHODS.map((m) => [m, rows.filter((r) => r.method === m).reduce((s, r) => s + r.amount, 0)]),
    ) as Record<(typeof MANUAL_METHODS)[number], number>;
    const [closing] = await tx
      .select()
      .from(cashClosings)
      .where(and(eq(cashClosings.userId, userId), eq(cashClosings.date, date)));
    return { payments: rows, expected, closing: closing ?? null };
  });
}

export const closeSchema = z.object({
  countedCash: z.number("Escribe el efectivo contado").int().min(0).max(1_000_000_000),
  notes: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
});

/** Cierra la caja del día: guarda lo esperado, lo contado y la diferencia. Una sola vez por persona y día. */
export async function closeCash(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  date: IsoDate,
  timeZone: string,
  raw: z.input<typeof closeSchema>,
) {
  const parsed = closeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, errors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  const draft = await cashDraft(database, ctx.schoolId, ctx.actorUserId, date, timeZone);
  if (draft.closing) return { ok: false as const, error: "closed" as const };
  const difference = input.countedCash - draft.expected.CASH;
  if (difference !== 0 && !input.notes)
    return { ok: false as const, errors: { notes: ["Explica la diferencia"] } };
  try {
    return await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      const [closing] = await tx
        .insert(cashClosings)
        .values({
          schoolId: ctx.schoolId,
          userId: ctx.actorUserId,
          date,
          expected: draft.expected,
          countedCash: input.countedCash,
          difference,
          notes: input.notes,
          paymentIds: draft.payments.map((p) => p.id),
        })
        .returning();
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.actorUserId,
        action: "cash.closed",
        entity: "cash_closing",
        entityId: closing.id,
        data: { date, expected: draft.expected, countedCash: input.countedCash, difference },
      });
      return { ok: true as const, id: closing.id, difference };
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") return { ok: false as const, error: "closed" as const };
    throw err;
  }
}

export function listClosings(database: Database, schoolId: string, limit = 60) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({ closing: cashClosings, userName: users.name })
      .from(cashClosings)
      .innerJoin(users, eq(users.id, cashClosings.userId))
      .orderBy(desc(cashClosings.date), desc(cashClosings.createdAt))
      .limit(limit),
  );
}

export function getClosing(database: Database, schoolId: string, id: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx
      .select({ closing: cashClosings, userName: users.name })
      .from(cashClosings)
      .innerJoin(users, eq(users.id, cashClosings.userId))
      .where(eq(cashClosings.id, id));
    if (!row) return null;
    const ids = row.closing.paymentIds;
    const list = ids.length
      ? await tx
          .select({
            code: payments.code,
            amount: payments.amount,
            method: payments.method,
            status: payments.status,
            guardianName: sql<string>`${guardians.firstName} || ' ' || ${guardians.lastName}`,
          })
          .from(payments)
          .innerJoin(guardians, eq(guardians.id, payments.guardianId))
          .where(
            sql`${payments.id} = any(array[${sql.join(
              ids.map((i) => sql`${i}`),
              sql`, `,
            )}]::uuid[])`,
          )
      : [];
    return { ...row, payments: list };
  });
}
