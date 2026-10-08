import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  auditLogs,
  collectionNotes,
  guardians,
  paymentPlanInstallments,
  paymentPlans,
  payments,
} from "@/db/schema";
import { addDays, addMonths, isoDateOf, type IsoDate } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { managerUserIds, notifyUsers } from "@/modules/notifications/notify";

/** Gestión de cobro (ADM-44) y acuerdos de pago (ADM-45). Solo administración. */

type Ctx = { schoolId: string; actorUserId: string };

export const NOTE_KIND_LABELS = {
  CALL: "Llamada",
  MESSAGE: "Mensaje",
  VISIT: "Visita",
  NOTE: "Nota",
} as const;

export const collectionNoteSchema = z
  .object({
    kind: z.enum(["CALL", "MESSAGE", "VISIT", "NOTE"]),
    note: z.string().trim().min(3, "Escribe qué pasó").max(500),
    promiseOn: z.iso.date().nullable().default(null),
    promiseAmount: z.number().int().min(1).max(100_000_000).nullable().default(null),
  })
  .refine((n) => n.promiseAmount === null || n.promiseOn !== null, {
    path: ["promiseOn"],
    message: "Escribe la fecha del compromiso",
  });

export async function addCollectionNote(
  database: Database,
  ctx: Ctx,
  guardianId: string,
  raw: z.input<typeof collectionNoteSchema>,
) {
  const parsed = collectionNoteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, errors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [guardian] = await tx
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.id, guardianId));
    if (!guardian) return { ok: false as const, errors: { note: ["Acudiente no encontrado"] } };
    const [note] = await tx
      .insert(collectionNotes)
      .values({
        schoolId: ctx.schoolId,
        guardianId,
        ...input,
        promiseStatus: input.promiseOn ? "OPEN" : null,
        createdByUserId: ctx.actorUserId,
      })
      .returning();
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "collection.note",
      entity: "guardian",
      entityId: guardianId,
      data: { kind: input.kind, promiseOn: input.promiseOn },
    });
    return { ok: true as const, id: note.id };
  });
}

export function listCollectionNotes(database: Database, schoolId: string, guardianId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(collectionNotes)
      .where(eq(collectionNotes.guardianId, guardianId))
      .orderBy(desc(collectionNotes.createdAt))
      .limit(50),
  );
}

/** Pagos confirmados del responsable desde una fecha. */
async function paidSince(tx: Tx, guardianId: string, since: IsoDate) {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
    .from(payments)
    .where(
      and(eq(payments.guardianId, guardianId), eq(payments.status, "CONFIRMED"), gte(payments.paidOn, since)),
    );
  return row.total;
}

export const paymentPlanSchema = z.object({
  total: z.number("Escribe el valor").int().min(1000, "El valor es muy bajo").max(100_000_000),
  installments: z.number().int().min(2, "Mínimo 2 cuotas").max(24, "Máximo 24 cuotas"),
  firstDueOn: z.iso.date("Escribe la fecha de la primera cuota"),
  notes: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
});

/** Cuotas iguales mensuales; la última absorbe el residuo para que sumen exacto. */
export function splitInstallments(total: number, count: number, firstDueOn: IsoDate) {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    dueOn: addMonths(firstDueOn, i),
    amount: i === count - 1 ? total - base * (count - 1) : base,
  }));
}

export async function createPaymentPlan(
  database: Database,
  ctx: Ctx,
  guardianId: string,
  raw: z.input<typeof paymentPlanSchema>,
  today: IsoDate,
) {
  const parsed = paymentPlanSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, errors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  if (input.firstDueOn < today)
    return { ok: false as const, errors: { firstDueOn: ["No puede ser pasada"] } };
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    // Un solo acuerdo vigente: el nuevo reemplaza al anterior.
    await tx
      .update(paymentPlans)
      .set({ status: "CANCELED" })
      .where(and(eq(paymentPlans.guardianId, guardianId), eq(paymentPlans.status, "ACTIVE")));
    const [plan] = await tx
      .insert(paymentPlans)
      .values({
        schoolId: ctx.schoolId,
        guardianId,
        total: input.total,
        startsOn: today,
        notes: input.notes,
        createdByUserId: ctx.actorUserId,
      })
      .returning();
    await tx.insert(paymentPlanInstallments).values(
      splitInstallments(input.total, input.installments, input.firstDueOn).map((i) => ({
        schoolId: ctx.schoolId,
        planId: plan.id,
        ...i,
      })),
    );
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "payment_plan.created",
      entity: "guardian",
      entityId: guardianId,
      data: { total: input.total, installments: input.installments },
    });
    return { ok: true as const, id: plan.id };
  });
}

export function cancelPaymentPlan(database: Database, ctx: Ctx, planId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [plan] = await tx
      .update(paymentPlans)
      .set({ status: "CANCELED" })
      .where(and(eq(paymentPlans.id, planId), eq(paymentPlans.status, "ACTIVE")))
      .returning();
    if (!plan) return false;
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "payment_plan.canceled",
      entity: "guardian",
      entityId: plan.guardianId,
      data: { planId },
    });
    return true;
  });
}

export type InstallmentState = "covered" | "overdue" | "pending";

/** Una cuota está cumplida si lo pagado desde el acuerdo cubre esa cuota y las anteriores. */
export function installmentStates(
  installments: { dueOn: IsoDate; amount: number }[],
  paid: number,
  today: IsoDate,
): InstallmentState[] {
  let cumulative = 0;
  return installments.map((i) => {
    cumulative += i.amount;
    if (paid >= cumulative) return "covered";
    return i.dueOn < today ? "overdue" : "pending";
  });
}

export function getActivePaymentPlan(
  database: Database,
  schoolId: string,
  guardianId: string,
  today: IsoDate,
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [plan] = await tx
      .select()
      .from(paymentPlans)
      .where(and(eq(paymentPlans.guardianId, guardianId), eq(paymentPlans.status, "ACTIVE")));
    if (!plan) return null;
    const installments = await tx
      .select()
      .from(paymentPlanInstallments)
      .where(eq(paymentPlanInstallments.planId, plan.id))
      .orderBy(asc(paymentPlanInstallments.position));
    const paid = await paidSince(tx, guardianId, plan.startsOn);
    const states = installmentStates(installments, paid, today);
    return { plan, paid, installments: installments.map((i, k) => ({ ...i, state: states[k] })) };
  });
}

/** Indicadores para la lista de deudores: acuerdo vigente y compromiso abierto. */
export function collectionFlags(database: Database, schoolId: string, guardianIds: string[]) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const flags = new Map<string, { plan: boolean; promiseOn: IsoDate | null }>();
    if (guardianIds.length === 0) return flags;
    const [plans, promises] = await Promise.all([
      tx
        .select({ guardianId: paymentPlans.guardianId })
        .from(paymentPlans)
        .where(and(inArray(paymentPlans.guardianId, guardianIds), eq(paymentPlans.status, "ACTIVE"))),
      tx
        .select({ guardianId: collectionNotes.guardianId, promiseOn: collectionNotes.promiseOn })
        .from(collectionNotes)
        .where(
          and(inArray(collectionNotes.guardianId, guardianIds), eq(collectionNotes.promiseStatus, "OPEN")),
        ),
    ]);
    for (const id of guardianIds) {
      const promise = promises
        .filter((p) => p.guardianId === id && p.promiseOn)
        .map((p) => p.promiseOn!)
        .sort()[0];
      if (plans.some((p) => p.guardianId === id) || promise)
        flags.set(id, { plan: plans.some((p) => p.guardianId === id), promiseOn: promise ?? null });
    }
    return flags;
  });
}

/**
 * Tarea diaria: cierra los compromisos vencidos (cumplido si pagó desde que se anotó) y avisa a la
 * administración de compromisos incumplidos y cuotas vencidas sin cubrir. Idempotente.
 */
export function runCollectionFollowUps(
  database: Database,
  school: { id: string; slug: string; timezone: string },
  today: IsoDate,
) {
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    let changes = 0;
    const managers = await managerUserIds(tx);
    const due = await tx
      .select({ note: collectionNotes, firstName: guardians.firstName, lastName: guardians.lastName })
      .from(collectionNotes)
      .innerJoin(guardians, eq(guardians.id, collectionNotes.guardianId))
      .where(and(eq(collectionNotes.promiseStatus, "OPEN"), lt(collectionNotes.promiseOn, today)));
    for (const { note, firstName, lastName } of due) {
      const paid = await paidSince(tx, note.guardianId, isoDateOf(note.createdAt, school.timezone));
      const kept = paid >= (note.promiseAmount ?? 1);
      await tx
        .update(collectionNotes)
        .set({ promiseStatus: kept ? "KEPT" : "BROKEN" })
        .where(eq(collectionNotes.id, note.id));
      if (!kept) {
        await notifyUsers(tx, school.id, managers, {
          kind: "collection.promise_broken",
          title: `Compromiso de pago incumplido: ${firstName} ${lastName}`,
          body: `Prometió pagar${note.promiseAmount ? ` ${formatCOP(note.promiseAmount)}` : ""} el ${note.promiseOn}.`,
          href: `/${school.slug}/acudientes/${note.guardianId}`,
          dedupeKey: `promise:${note.id}`,
        });
      }
      changes++;
    }

    const plans = await tx
      .select({ plan: paymentPlans, firstName: guardians.firstName, lastName: guardians.lastName })
      .from(paymentPlans)
      .innerJoin(guardians, eq(guardians.id, paymentPlans.guardianId))
      .where(eq(paymentPlans.status, "ACTIVE"));
    for (const { plan, firstName, lastName } of plans) {
      const installments = await tx
        .select()
        .from(paymentPlanInstallments)
        .where(eq(paymentPlanInstallments.planId, plan.id))
        .orderBy(asc(paymentPlanInstallments.position));
      const paid = await paidSince(tx, plan.guardianId, plan.startsOn);
      if (paid >= plan.total) {
        await tx.update(paymentPlans).set({ status: "COMPLETED" }).where(eq(paymentPlans.id, plan.id));
        changes++;
        continue;
      }
      const states = installmentStates(installments, paid, today);
      for (const [k, state] of states.entries()) {
        // Se avisa al día siguiente del vencimiento, una sola vez por cuota.
        if (state !== "overdue" || installments[k].dueOn !== addDays(today, -1)) continue;
        await notifyUsers(tx, school.id, managers, {
          kind: "collection.installment_overdue",
          title: `Cuota ${installments[k].position} vencida: ${firstName} ${lastName}`,
          body: `Acuerdo de pago: ${formatCOP(installments[k].amount)} con vencimiento ${installments[k].dueOn}.`,
          href: `/${school.slug}/acudientes/${plan.guardianId}`,
          dedupeKey: `installment:${installments[k].id}`,
        });
        changes++;
      }
    }
    return changes;
  });
}
