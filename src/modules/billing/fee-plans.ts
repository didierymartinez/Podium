import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { auditLogs, feePlans } from "@/db/schema";

export const MAX_MONTHLY_AMOUNT = 20_000_000;

export const feePlanSchema = z.object({
  name: z.string().trim().min(2, "Escribe un nombre para la tarifa").max(60),
  description: z
    .string()
    .trim()
    .max(160)
    .transform((v) => v || null),
  monthlyAmount: z
    .number("Escribe el valor mensual")
    .int()
    .min(1000, "El valor mínimo es $ 1.000")
    .max(MAX_MONTHLY_AMOUNT, "El valor es demasiado alto"),
});

export type FeePlanInput = z.infer<typeof feePlanSchema>;
type Ctx = { schoolId: string; actorUserId: string };

export function listFeePlans(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(feePlans)
      .orderBy(desc(feePlans.active), asc(feePlans.monthlyAmount), asc(feePlans.name)),
  );
}

export function createFeePlan(database: Database, ctx: Ctx, input: FeePlanInput) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [plan] = await tx
      .insert(feePlans)
      .values({ schoolId: ctx.schoolId, ...input })
      .returning();
    await audit(tx, ctx, "fee_plan.created", plan.id, input);
    return plan;
  });
}

/** Cambiar el valor aplica a los cobros que se generen desde ahora (los emitidos no cambian). */
export function updateFeePlan(database: Database, ctx: Ctx, feePlanId: string, input: FeePlanInput) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [plan] = await tx
      .update(feePlans)
      .set(input)
      .where(and(eq(feePlans.id, feePlanId), eq(feePlans.schoolId, ctx.schoolId)))
      .returning();
    if (plan) await audit(tx, ctx, "fee_plan.updated", plan.id, input);
    return plan ?? null;
  });
}

/** Las tarifas no se borran (las usarán matrículas y cobros); se archivan. */
export function setFeePlanActive(database: Database, ctx: Ctx, feePlanId: string, active: boolean) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [plan] = await tx
      .update(feePlans)
      .set({ active })
      .where(and(eq(feePlans.id, feePlanId), eq(feePlans.schoolId, ctx.schoolId)))
      .returning();
    if (plan) await audit(tx, ctx, active ? "fee_plan.activated" : "fee_plan.archived", plan.id, {});
    return plan ?? null;
  });
}

async function audit(tx: Tx, ctx: Ctx, action: string, entityId: string, data: object) {
  await tx.insert(auditLogs).values({
    schoolId: ctx.schoolId,
    actorUserId: ctx.actorUserId,
    action,
    entity: "fee_plan",
    entityId,
    data,
  });
}
