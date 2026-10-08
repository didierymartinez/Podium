import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { pgErrorCode, runInTenant, type Database, type Tx } from "@/db/rls";
import {
  athleteGuardians,
  athletes,
  auditLogs,
  enrollments,
  guardians,
  invoices,
  reenrollmentCampaigns,
  reenrollments,
} from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { chargePerAthleteTx } from "@/modules/billing/invoices";
import type { BillingPolicy } from "@/modules/billing/policy";
import { notifyUsers } from "@/modules/notifications/notify";

/** Re-matrícula anual (ADM-18): cobro de matrícula del año y confirmación de datos por las familias. */

type Ctx = { schoolId: string; actorUserId: string; slug: string };

export const campaignSchema = z.object({
  year: z.number().int().min(2024).max(2100),
  amount: z.number("Escribe el valor").int().min(0).max(10_000_000),
  dueOn: z.iso.date("Escribe la fecha de vencimiento"),
});

/** Alumnos con matrícula activa o congelada (los que siguen en la escuela). */
async function currentAthletes(tx: Tx) {
  const rows = await tx
    .selectDistinct({ id: athletes.id, firstName: athletes.firstName, lastName: athletes.lastName })
    .from(enrollments)
    .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
    .where(inArray(enrollments.status, ["ACTIVE", "FROZEN"]))
    .orderBy(asc(athletes.firstName), asc(athletes.lastName));
  return rows;
}

export type CampaignError = "exists" | "no_athletes";

/** Lanza la campaña: genera la re-matrícula a cada responsable de pago y pide confirmar datos. */
export async function launchCampaign(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof campaignSchema>,
  today: IsoDate,
  policy: BillingPolicy,
): Promise<{ ok: true; athletes: number; invoices: number } | { ok: false; error: CampaignError }> {
  const input = campaignSchema.parse(raw);
  try {
    return await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      const list = await currentAthletes(tx);
      if (list.length === 0) return { ok: false as const, error: "no_athletes" as const };
      const [campaign] = await tx
        .insert(reenrollmentCampaigns)
        .values({ schoolId: ctx.schoolId, ...input, createdByUserId: ctx.actorUserId })
        .returning();
      const invoiceOf =
        input.amount > 0
          ? await chargePerAthleteTx(
              tx,
              ctx,
              list.map((a) => ({ athleteId: a.id, firstName: a.firstName })),
              {
                kind: "ENROLLMENT",
                description: `Re-matrícula ${input.year}`,
                amount: input.amount,
                dueOn: input.dueOn,
                today,
              },
              policy,
            )
          : new Map<string, string>();
      await tx.insert(reenrollments).values(
        list.map((a) => ({
          schoolId: ctx.schoolId,
          campaignId: campaign.id,
          athleteId: a.id,
          invoiceId: invoiceOf.get(a.id) ?? null,
        })),
      );
      // Pedir a cada familia que revise sus datos (una vez por persona).
      const family = await tx
        .selectDistinct({ userId: guardians.userId })
        .from(athleteGuardians)
        .innerJoin(guardians, eq(guardians.id, athleteGuardians.guardianId))
        .where(
          inArray(
            athleteGuardians.athleteId,
            list.map((a) => a.id),
          ),
        );
      await notifyUsers(
        tx,
        ctx.schoolId,
        family.map((f) => f.userId),
        {
          kind: "reenrollment",
          title: `Re-matrícula ${input.year}`,
          body: "Revisa y confirma los datos de tu familia para el nuevo año.",
          href: `/${ctx.slug}/mis-datos`,
          dedupeKey: `reenrollment:${campaign.id}`,
        },
      );
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.actorUserId,
        action: "reenrollment.launched",
        entity: "school",
        entityId: ctx.schoolId,
        data: { year: input.year, amount: input.amount, athletes: list.length },
      });
      return { ok: true as const, athletes: list.length, invoices: new Set(invoiceOf.values()).size };
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") return { ok: false, error: "exists" };
    throw err;
  }
}

export function previewCampaign(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, (tx) => currentAthletes(tx));
}

/** Campañas con el avance: cobradas, pagadas y datos confirmados. */
export function listCampaigns(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const campaigns = await tx.select().from(reenrollmentCampaigns).orderBy(desc(reenrollmentCampaigns.year));
    if (campaigns.length === 0) return [];
    const rows = await tx
      .select({
        campaignId: reenrollments.campaignId,
        athleteId: athletes.id,
        name: athletes.firstName,
        lastName: athletes.lastName,
        confirmedAt: reenrollments.confirmedAt,
        invoiceStatus: invoices.status,
      })
      .from(reenrollments)
      .innerJoin(athletes, eq(athletes.id, reenrollments.athleteId))
      .leftJoin(invoices, eq(invoices.id, reenrollments.invoiceId))
      .where(
        inArray(
          reenrollments.campaignId,
          campaigns.map((c) => c.id),
        ),
      )
      .orderBy(asc(athletes.firstName));
    return campaigns.map((c) => {
      const list = rows.filter((r) => r.campaignId === c.id);
      return {
        campaign: c,
        athletes: list.map((r) => ({
          id: r.athleteId,
          name: `${r.name} ${r.lastName}`,
          paid: c.amount === 0 || r.invoiceStatus === "PAID",
          confirmed: r.confirmedAt !== null,
        })),
      };
    });
  });
}

/**
 * Re-matrículas pendientes de confirmar para la familia. Va dentro de `asPortalUser`
 * (RLS: solo sus hijos).
 */
export function pendingConfirmations(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({ id: reenrollments.id, year: reenrollmentCampaigns.year, firstName: athletes.firstName })
      .from(reenrollments)
      .innerJoin(reenrollmentCampaigns, eq(reenrollmentCampaigns.id, reenrollments.campaignId))
      .innerJoin(athletes, eq(athletes.id, reenrollments.athleteId))
      .where(isNull(reenrollments.confirmedAt)),
  );
}

/** La familia confirma que sus datos están al día (dentro de `asPortalUser`). */
export function confirmFamilyData(database: Database, schoolId: string, userId: string, now: Date) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const updated = await tx
      .update(reenrollments)
      .set({ confirmedAt: now, confirmedByUserId: userId })
      .where(isNull(reenrollments.confirmedAt))
      .returning({ id: reenrollments.id });
    return updated.length;
  });
}
