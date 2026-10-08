import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { pgErrorCode, runInTenant, type Database, type Tx } from "@/db/rls";
import { athletes, auditLogs, gymCheckins, membershipPlans, memberships } from "@/db/schema";
import { addDays, type IsoDate } from "@/lib/dates";
import { createAthleteTx } from "@/modules/athletes/athletes";
import { athleteSchema, guardianSchema } from "@/modules/athletes/schemas";
import { chargeAthleteLinesTx } from "@/modules/billing/invoices";
import type { BillingPolicy } from "@/modules/billing/policy";

/** Vertical gimnasio (EVALUACION_GIMNASIOS §6): membresías por periodo o ticketera, ingresos y retención. */

type Ctx = { schoolId: string; actorUserId: string };

/** Avisos de retención. */
export const EXPIRING_DAYS = 7;
export const INACTIVE_DAYS = 10;

export const planSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe el nombre del plan").max(80),
    kind: z.enum(["PERIOD", "VISITS"]),
    days: z.number("Escribe la vigencia").int().min(1).max(730),
    visits: z.number().int().min(1).max(500).nullable(),
    price: z.number("Escribe el precio").int().min(0).max(100_000_000),
  })
  .refine((p) => p.kind === "PERIOD" || p.visits !== null, {
    message: "Escribe cuántas visitas tiene",
    path: ["visits"],
  });

export async function createPlan(database: Database, ctx: Ctx, raw: z.input<typeof planSchema>) {
  const input = planSchema.parse(raw);
  try {
    const [row] = await runInTenant(database, { schoolId: ctx.schoolId }, (tx) =>
      tx
        .insert(membershipPlans)
        .values({ schoolId: ctx.schoolId, ...input, visits: input.kind === "VISITS" ? input.visits : null })
        .returning({ id: membershipPlans.id }),
    );
    return { ok: true as const, id: row.id };
  } catch (err) {
    if (pgErrorCode(err) === "23505") return { ok: false as const, error: "exists" as const };
    throw err;
  }
}

export function listPlans(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx.select().from(membershipPlans).orderBy(desc(membershipPlans.active), asc(membershipPlans.price)),
  );
}

export const memberSchema = z.object({
  firstName: z.string().trim().min(2, "Escribe el nombre").max(60),
  lastName: z.string().trim().min(2, "Escribe el apellido").max(60),
  birthDate: z.iso.date("Escribe la fecha de nacimiento"),
  phone: z.string().trim().min(7, "Escribe el celular").max(20),
  email: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => v ?? ""),
});

/** Nuevo socio: es su propio responsable de pago (sus cuentas de cobro le llegan a él). */
export function createMember(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof memberSchema>,
  today: IsoDate,
) {
  const input = memberSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const person = { firstName: input.firstName, lastName: input.lastName };
    const created = await createAthleteTx(tx, ctx, {
      athlete: athleteSchema.parse({
        ...person,
        documentType: null,
        documentNumber: "",
        birthDate: input.birthDate,
        sex: null,
        phone: input.phone,
        email: input.email,
        healthInsurer: "",
        bloodType: null,
        medicalNotes: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        schoolName: "",
        notes: "",
      }),
      guardian: {
        ...guardianSchema.parse({
          ...person,
          documentType: null,
          documentNumber: "",
          phone: input.phone,
          email: input.email,
        }),
        relationship: "OTHER",
      },
      enrollment: null,
      today,
    });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "gym.member_created",
      entity: "athlete",
      entityId: created.athleteId,
      data: {},
    });
    return created.athleteId;
  });
}

/** Membresía vigente hoy (con visitas disponibles si es ticketera). */
async function currentMembershipTx(tx: Tx, athleteId: string, today: IsoDate) {
  const rows = await tx
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.athleteId, athleteId),
        lte(memberships.startsOn, today),
        gte(memberships.endsOn, today),
      ),
    )
    .orderBy(asc(memberships.startsOn));
  return rows.find((m) => m.kind === "PERIOD" || (m.visitsTotal ?? 0) > m.visitsUsed) ?? null;
}

export type SaleResult =
  | { ok: true; membershipId: string; startsOn: IsoDate; endsOn: IsoDate; invoiceId: string | null }
  | { ok: false; error: "not_found" | "no_payer" };

/**
 * Vende o renueva: si ya tiene una membresía que termina en el futuro, la nueva empieza el día siguiente
 * (renovación en 1 toque). Genera la cuenta de cobro al socio.
 */
export function sellMembership(
  database: Database,
  ctx: Ctx & { slug: string },
  input: { athleteId: string; planId: string },
  today: IsoDate,
  policy: BillingPolicy,
): Promise<SaleResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx): Promise<SaleResult> => {
    const [[plan], [athlete]] = await Promise.all([
      tx.select().from(membershipPlans).where(eq(membershipPlans.id, input.planId)),
      tx
        .select({ id: athletes.id, firstName: athletes.firstName })
        .from(athletes)
        .where(eq(athletes.id, input.athleteId)),
    ]);
    if (!plan || !plan.active || !athlete) return { ok: false, error: "not_found" };
    const [latest] = await tx
      .select({ endsOn: memberships.endsOn })
      .from(memberships)
      .where(eq(memberships.athleteId, athlete.id))
      .orderBy(desc(memberships.endsOn))
      .limit(1);
    const startsOn = latest && latest.endsOn >= today ? addDays(latest.endsOn, 1) : today;
    const endsOn = addDays(startsOn, plan.days - 1);
    const invoiceId =
      plan.price > 0
        ? await chargeAthleteLinesTx(
            tx,
            ctx,
            athlete,
            {
              title: `Membresía ${plan.name}`,
              lines: [
                { description: `Membresía ${plan.name} (${startsOn} a ${endsOn})`, amount: plan.price },
              ],
              dueOn: startsOn,
              today,
            },
            policy,
          )
        : null;
    if (plan.price > 0 && !invoiceId) return { ok: false, error: "no_payer" };
    const [row] = await tx
      .insert(memberships)
      .values({
        schoolId: ctx.schoolId,
        athleteId: athlete.id,
        planId: plan.id,
        planName: plan.name,
        kind: plan.kind,
        startsOn,
        endsOn,
        visitsTotal: plan.kind === "VISITS" ? plan.visits : null,
        price: plan.price,
        invoiceId,
        createdByUserId: ctx.actorUserId,
      })
      .returning({ id: memberships.id });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "gym.membership_sold",
      entity: "athlete",
      entityId: athlete.id,
      data: { plan: plan.name, startsOn, endsOn, price: plan.price },
    });
    return { ok: true, membershipId: row.id, startsOn, endsOn, invoiceId };
  });
}

export type CheckInResult =
  | {
      ok: true;
      already: boolean;
      membership: { planName: string; endsOn: IsoDate; visitsLeft: number | null };
    }
  | { ok: false; error: "no_membership" | "not_found" };

/**
 * Ingreso (recepción o QR del socio): valida la membresía vigente y descuenta la visita de la ticketera.
 * Un ingreso por día; repetirlo no descuenta otra visita. En el portal va dentro de `asPortalUser`.
 */
export function gymCheckIn(
  database: Database,
  ctx: Ctx,
  athleteId: string,
  today: IsoDate,
  source: "reception" | "self",
): Promise<CheckInResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx): Promise<CheckInResult> => {
    const [athlete] = await tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.id, athleteId));
    if (!athlete) return { ok: false, error: "not_found" };
    const membership = await currentMembershipTx(tx, athleteId, today);
    if (!membership) return { ok: false, error: "no_membership" };
    const inserted = await tx
      .insert(gymCheckins)
      .values({
        schoolId: ctx.schoolId,
        athleteId,
        membershipId: membership.id,
        source,
        checkedInOn: today,
        createdByUserId: ctx.actorUserId,
      })
      .onConflictDoNothing()
      .returning({ id: gymCheckins.id });
    let used = membership.visitsUsed;
    if (inserted.length && membership.kind === "VISITS") {
      used++;
      await tx.update(memberships).set({ visitsUsed: used }).where(eq(memberships.id, membership.id));
    }
    return {
      ok: true,
      already: inserted.length === 0,
      membership: {
        planName: membership.planName,
        endsOn: membership.endsOn,
        visitsLeft: membership.kind === "VISITS" ? (membership.visitsTotal ?? 0) - used : null,
      },
    };
  });
}

export type MemberRow = {
  id: string;
  name: string;
  current: { planName: string; endsOn: IsoDate; visitsLeft: number | null } | null;
  nextEndsOn: IsoDate | null;
  lastCheckIn: IsoDate | null;
  expiring: boolean;
  inactive: boolean;
};

/** Socios con su membresía, último ingreso y alertas de retención. */
export function listMembers(database: Database, schoolId: string, today: IsoDate): Promise<MemberRow[]> {
  return runInTenant(database, { schoolId }, async (tx) => {
    // En un gimnasio cada alumno es socio, tenga o no membresía vigente.
    const [all, people] = await Promise.all([
      tx.select().from(memberships).orderBy(asc(memberships.startsOn)),
      tx
        .select({ id: athletes.id, firstName: athletes.firstName, lastName: athletes.lastName })
        .from(athletes)
        .limit(1000),
    ]);
    if (people.length === 0) return [];
    const last = await tx
      .select({ athleteId: gymCheckins.athleteId, last: sql<string>`max(${gymCheckins.checkedInOn})` })
      .from(gymCheckins)
      .groupBy(gymCheckins.athleteId);
    return people
      .map((p) => {
        const own = all.filter((m) => m.athleteId === p.id);
        const current =
          own.find(
            (m) =>
              m.startsOn <= today &&
              m.endsOn >= today &&
              (m.kind === "PERIOD" || (m.visitsTotal ?? 0) > m.visitsUsed),
          ) ?? null;
        const furthest = own.reduce<IsoDate | null>(
          (d, m) => (d === null || m.endsOn > d ? m.endsOn : d),
          null,
        );
        const lastCheckIn = last.find((l) => l.athleteId === p.id)?.last ?? null;
        return {
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          current: current && {
            planName: current.planName,
            endsOn: current.endsOn,
            visitsLeft: current.kind === "VISITS" ? (current.visitsTotal ?? 0) - current.visitsUsed : null,
          },
          nextEndsOn: furthest,
          lastCheckIn,
          // Por vencer: lo último que tiene termina en ≤ 7 días (sin renovación posterior).
          expiring: furthest !== null && furthest >= today && furthest <= addDays(today, EXPIRING_DAYS),
          inactive:
            current !== null && (lastCheckIn === null || lastCheckIn < addDays(today, -INACTIVE_DAYS)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** Membresías e ingresos del socio (portal: dentro de `asPortalUser`). */
export function memberSummary(database: Database, schoolId: string, athleteId: string, today: IsoDate) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [current, history, visits] = await Promise.all([
      currentMembershipTx(tx, athleteId, today),
      tx
        .select()
        .from(memberships)
        .where(eq(memberships.athleteId, athleteId))
        .orderBy(desc(memberships.startsOn))
        .limit(5),
      tx
        .select({ on: gymCheckins.checkedInOn })
        .from(gymCheckins)
        .where(and(eq(gymCheckins.athleteId, athleteId), gte(gymCheckins.checkedInOn, addDays(today, -30)))),
    ]);
    return { current, history, visitsLast30: visits.length };
  });
}
