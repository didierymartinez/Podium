import { randomBytes } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { auditLogs, platformInvoices, schools, subscriptions } from "@/db/schema";
import { addDays, todayIn, type IsoDate } from "@/lib/dates";
import { isPlanCode, monthlyRevenue, planOf, priceOf, type Interval } from "@/modules/subscription/plans";
import { applyTransaction, periodEndOf } from "@/modules/subscription/subscription";

/** Consola de super admin de Podium (#17, docs/ONBOARDING_ESCUELAS.md §5). Supervisa; no aprueba nada. */

export type PlatformSchool = {
  id: string;
  slug: string;
  name: string;
  city: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "READ_ONLY" | "CANCELED";
  created_at: Date;
  trial_ends_at: Date | null;
  suspended_at: Date | null;
  comms_enabled_at: Date | null;
  owner_name: string;
  owner_email: string;
  plan_code: string | null;
  subscription_status: string | null;
  billing_interval: Interval | null;
  discount_percent: number | null;
  discount_until: string | null;
  current_period_end: Date | null;
  canceled_at: Date | null;
  active_athletes: number;
  groups: number;
  fee_plans: number;
  coaches: number;
  paid_invoices: number;
  last_activity: Date | null;
};

const asDate = (v: unknown) =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v));

export async function listPlatformSchools(
  database: Database,
  adminUserId: string,
): Promise<PlatformSchool[]> {
  const rows = await runInTenant(database, { userId: adminUserId }, (tx) =>
    tx.execute<Record<string, unknown>>(sql`select * from platform_schools()`),
  );
  return [...rows].map((r) => ({
    ...(r as unknown as PlatformSchool),
    created_at: asDate(r.created_at)!,
    trial_ends_at: asDate(r.trial_ends_at),
    suspended_at: asDate(r.suspended_at),
    comms_enabled_at: asDate(r.comms_enabled_at),
    current_period_end: asDate(r.current_period_end),
    canceled_at: asDate(r.canceled_at),
    last_activity: asDate(r.last_activity),
  }));
}

export async function platformSignups(database: Database, adminUserId: string, since: IsoDate) {
  const rows = await runInTenant(database, { userId: adminUserId }, (tx) =>
    tx.execute<{ day: string | Date; users: number; schools: number }>(
      sql`select day, users, schools from platform_signups(${since}::date)`,
    ),
  );
  return [...rows].map((r) => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    users: Number(r.users),
    schools: Number(r.schools),
  }));
}

/** Puntaje de configuración (0–1): tarifas, grupos, profesores, alumnos y comunicaciones. */
export const setupScore = (s: PlatformSchool) =>
  [s.fee_plans > 0, s.groups > 0, s.coaches > 0, s.active_athletes > 0, s.comms_enabled_at !== null].filter(
    Boolean,
  ).length / 5;

const TRIAL_MS = 30 * 86_400_000;

export function platformMetrics(rows: PlatformSchool[], now: Date) {
  const byStatus = { TRIAL: 0, ACTIVE: 0, PAST_DUE: 0, READ_ONLY: 0, CANCELED: 0 };
  for (const r of rows) byStatus[r.status]++;
  const paying = rows.filter(
    (r) => (r.status === "ACTIVE" || r.status === "PAST_DUE") && r.plan_code && planOf(r.plan_code),
  );
  const mrr = paying.reduce(
    (s, r) =>
      s + monthlyRevenue(planOf(r.plan_code!)!, r.billing_interval ?? "MONTHLY", r.discount_percent ?? 0),
    0,
  );
  // Conversión: de las escuelas cuya prueba ya terminó, cuántas han pagado alguna vez.
  const trialOver = rows.filter((r) => now.getTime() - r.created_at.getTime() >= TRIAL_MS);
  const converted = trialOver.filter((r) => r.paid_invoices > 0).length;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const churned = rows.filter(
    (r) => r.paid_invoices > 0 && r.canceled_at && r.canceled_at >= monthStart,
  ).length;
  return {
    schools: rows.length,
    byStatus,
    suspended: rows.filter((r) => r.suspended_at).length,
    mrr,
    conversion: trialOver.length ? converted / trialOver.length : null,
    churn: paying.length + churned ? churned / (paying.length + churned) : 0,
    setup: rows.length ? rows.reduce((s, r) => s + setupScore(r), 0) / rows.length : 0,
  };
}

export function schoolDetail(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [[school], [subscription], invoices, audit] = await Promise.all([
      tx.select().from(schools).where(eq(schools.id, schoolId)),
      tx.select().from(subscriptions).where(eq(subscriptions.schoolId, schoolId)),
      tx.select().from(platformInvoices).orderBy(desc(platformInvoices.createdAt)).limit(12),
      tx.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(25),
    ]);
    return school ? { school, subscription, invoices, audit } : null;
  });
}

type Admin = { id: string };

/** Defensa en profundidad: además del control en la página, la base confirma que es super admin. */
async function asAdmin<T>(database: Database, admin: Admin, schoolId: string, fn: (tx: Tx) => Promise<T>) {
  return runInTenant(database, { schoolId, userId: admin.id }, async (tx) => {
    const [row] = await tx.execute<{ ok: boolean }>(sql`select app_is_platform_admin() as ok`);
    if (!row?.ok) throw new Error("No es super admin");
    return fn(tx);
  });
}

const log = (tx: Tx, admin: Admin, schoolId: string, action: string, data: object) =>
  tx.insert(auditLogs).values({
    schoolId,
    actorUserId: admin.id,
    action,
    entity: "school",
    entityId: schoolId,
    data: { ...data, byPodium: true },
  });

export async function extendTrial(
  database: Database,
  admin: Admin,
  schoolId: string,
  days: number,
  now: Date,
) {
  const n = z.number().int().min(1).max(90).parse(days);
  return asAdmin(database, admin, schoolId, async (tx) => {
    const [school] = await tx.select().from(schools).where(eq(schools.id, schoolId));
    if (school.status !== "TRIAL" && school.status !== "READ_ONLY") return false;
    const base = school.trialEndsAt && school.trialEndsAt > now ? school.trialEndsAt : now;
    const trialEndsAt = new Date(base.getTime() + n * 86_400_000);
    await tx.update(schools).set({ status: "TRIAL", trialEndsAt }).where(eq(schools.id, schoolId));
    await tx
      .update(subscriptions)
      .set({ status: "TRIALING", trialEndsAt, readOnlySince: null })
      .where(eq(subscriptions.schoolId, schoolId));
    await log(tx, admin, schoolId, "platform.trial_extended", { days: n, trialEndsAt });
    return true;
  });
}

export const couponSchema = z.object({
  percent: z.number().int().min(0).max(100),
  until: z.iso.date().nullable(),
});

export async function setCoupon(
  database: Database,
  admin: Admin,
  schoolId: string,
  raw: z.input<typeof couponSchema>,
) {
  const input = couponSchema.parse(raw);
  return asAdmin(database, admin, schoolId, async (tx) => {
    await tx
      .update(subscriptions)
      .set({ discountPercent: input.percent, discountUntil: input.until })
      .where(eq(subscriptions.schoolId, schoolId));
    await log(tx, admin, schoolId, "platform.coupon", input);
    return true;
  });
}

/** Activación manual (pago por fuera, mientras no haya Wompi de Podium): crea la cuenta y la marca pagada. */
export async function activatePlanManually(
  database: Database,
  admin: Admin,
  schoolId: string,
  input: { planCode: string; interval: Interval },
  now: Date,
) {
  if (!isPlanCode(input.planCode)) return false;
  const plan = planOf(input.planCode)!;
  const invoice = await asAdmin(database, admin, schoolId, async (tx) => {
    const [[school], [sub]] = await Promise.all([
      tx.select().from(schools).where(eq(schools.id, schoolId)),
      tx.select().from(subscriptions).where(eq(subscriptions.schoolId, schoolId)),
    ]);
    const today = todayIn(school.timezone, now);
    const end = sub.currentPeriodEnd ? todayIn(school.timezone, sub.currentPeriodEnd) : null;
    const start = end && end >= today ? addDays(end, 1) : today;
    const [created] = await tx
      .insert(platformInvoices)
      .values({
        schoolId,
        reference: `POD-${randomBytes(6).toString("hex").toUpperCase()}`,
        planCode: plan.code,
        interval: input.interval,
        periodStart: start,
        periodEnd: periodEndOf(start, input.interval),
        amount: priceOf(plan, input.interval, sub.discountPercent),
      })
      .returning();
    await log(tx, admin, schoolId, "platform.plan_activated", { plan: plan.code, interval: input.interval });
    return created;
  });
  await applyTransaction(
    database,
    schoolId,
    {
      id: `manual-${admin.id}`,
      reference: invoice.reference,
      status: "APPROVED",
      amountInCents: invoice.amount * 100,
      createdAt: now.toISOString(),
    },
    now,
  );
  return true;
}

export async function suspendSchool(
  database: Database,
  admin: Admin,
  schoolId: string,
  reason: string,
  now: Date,
) {
  const text = z.string().trim().min(5).max(300).parse(reason);
  return asAdmin(database, admin, schoolId, async (tx) => {
    await tx.update(schools).set({ suspendedAt: now, suspendedReason: text }).where(eq(schools.id, schoolId));
    await log(tx, admin, schoolId, "platform.suspended", { reason: text });
    return true;
  });
}

export async function unsuspendSchool(database: Database, admin: Admin, schoolId: string) {
  return asAdmin(database, admin, schoolId, async (tx) => {
    await tx
      .update(schools)
      .set({ suspendedAt: null, suspendedReason: null })
      .where(eq(schools.id, schoolId));
    await log(tx, admin, schoolId, "platform.unsuspended", {});
    return true;
  });
}

/** "Entrar como": queda en la auditoría de la escuela con el motivo. */
export async function logSupportAccess(database: Database, admin: Admin, schoolId: string, reason: string) {
  const text = z.string().trim().min(5).max(300).parse(reason);
  return asAdmin(database, admin, schoolId, async (tx) => {
    const [school] = await tx.select({ slug: schools.slug }).from(schools).where(eq(schools.id, schoolId));
    await log(tx, admin, schoolId, "platform.support_access", { reason: text });
    return school?.slug ?? null;
  });
}
