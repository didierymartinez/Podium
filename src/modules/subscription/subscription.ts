import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { auditLogs, enrollments, platformInvoices, schools, subscriptions, users } from "@/db/schema";
import { addDays, addMonths, instantOf, isoDateOf, todayIn, type IsoDate } from "@/lib/dates";
import { emailLayout, PODIUM_BRAND } from "@/lib/mailer/templates";
import type { Mailer } from "@/lib/mailer/types";
import { formatCOP } from "@/lib/money";
import type { PaymentProvider, ProviderKeys, ProviderTransaction } from "@/modules/payments/provider";
import type { CardApi } from "./podium-wompi";
import { exceedsPlan, isPlanCode, planFor, planOf, priceOf, type Interval, type Plan } from "./plans";

/**
 * Suscripción de la escuela a Podium (#21, docs/ONBOARDING_ESCUELAS.md §2 [6] y §3).
 * PRUEBA → (no paga) SOLO_LECTURA → (60 días) CANCELADA; ACTIVA → (no paga) EN_MORA → (7 días) SOLO_LECTURA.
 * Ningún estado bloquea los pagos de los acudientes a la escuela.
 */
export const GRACE_DAYS = 7;
export const READ_ONLY_DAYS = 60;
export const OVER_LIMIT_DAYS = 7;
/** Reintentos del cobro automático, en días desde que entró en mora. */
export const RETRY_DAYS = [1, 3, 5];
const DAY_MS = 86_400_000;

type Ctx = { schoolId: string; actorUserId: string | null };

const daysSince = (from: Date, now: Date) => Math.floor((now.getTime() - from.getTime()) / DAY_MS);

export { addMonths } from "@/lib/dates";

/** Periodo que cubre un pago: desde `start` hasta el día anterior al mismo día del mes (o año) siguiente. */
export const periodEndOf = (start: IsoDate, interval: Interval) =>
  addDays(addMonths(start, interval === "ANNUAL" ? 12 : 1), -1);

export const billingProfileSchema = z.object({
  legalName: z.string().trim().min(3, "Escribe la razón social o el nombre").max(120),
  documentType: z.enum(["NIT", "CC", "CE"]),
  documentNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^0-9-]/g, ""))
    .pipe(z.string().min(5, "Escribe el número de documento").max(15)),
  address: z.string().trim().min(5, "Escribe la dirección").max(160),
  billingEmail: z.email("Escribe un email válido").max(120),
});
export type BillingProfile = z.infer<typeof billingProfileSchema>;

async function countActiveAthletes(tx: Tx) {
  const [row] = await tx
    .select({ n: sql<number>`count(distinct ${enrollments.athleteId})::int` })
    .from(enrollments)
    .where(eq(enrollments.status, "ACTIVE"));
  return row.n;
}

async function audit(tx: Tx, ctx: Ctx, action: string, data: object = {}) {
  await tx.insert(auditLogs).values({
    schoolId: ctx.schoolId,
    actorUserId: ctx.actorUserId,
    action,
    entity: "subscription",
    entityId: ctx.schoolId,
    data,
  });
}

export function getSubscription(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [[school], [subscription], invoices, activeAthletes] = await Promise.all([
      tx.select().from(schools).where(eq(schools.id, schoolId)),
      tx.select().from(subscriptions).where(eq(subscriptions.schoolId, schoolId)),
      tx.select().from(platformInvoices).orderBy(desc(platformInvoices.createdAt)).limit(24),
      countActiveAthletes(tx),
    ]);
    const plan = planOf(subscription.planCode);
    return {
      school,
      subscription,
      plan,
      invoices,
      activeAthletes,
      suggested: planFor(activeAthletes),
      overLimit: plan ? exceedsPlan(plan, activeAthletes) : false,
      profileComplete: Boolean(
        school.legalName && school.documentNumber && school.address && subscription.billingEmail,
      ),
    };
  });
}

export async function saveBillingProfile(database: Database, ctx: Ctx, raw: unknown) {
  const parsed = billingProfileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, errors: z.flattenError(parsed.error).fieldErrors };
  const { billingEmail, ...legal } = parsed.data;
  await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.update(schools).set(legal).where(eq(schools.id, ctx.schoolId));
    await tx.update(subscriptions).set({ billingEmail }).where(eq(subscriptions.schoolId, ctx.schoolId));
    await audit(tx, ctx, "subscription.billing_profile", parsed.data);
  });
  return { ok: true as const };
}

const newReference = () => `POD-${randomBytes(6).toString("hex").toUpperCase()}`;

/** Inicio del próximo periodo: el día siguiente al fin del periodo pagado, o hoy. */
function nextStart(sub: typeof subscriptions.$inferSelect, timeZone: string, today: IsoDate) {
  if (!sub.currentPeriodEnd) return today;
  const end = isoDateOf(sub.currentPeriodEnd, timeZone);
  return end >= today ? addDays(end, 1) : today;
}

async function createInvoiceTx(
  tx: Tx,
  schoolId: string,
  input: { plan: Plan; interval: Interval; start: IsoDate; discountPercent: number },
) {
  const [invoice] = await tx
    .insert(platformInvoices)
    .values({
      schoolId,
      reference: newReference(),
      planCode: input.plan.code,
      interval: input.interval,
      periodStart: input.start,
      periodEnd: periodEndOf(input.start, input.interval),
      amount: priceOf(input.plan, input.interval, input.discountPercent),
    })
    .returning();
  return invoice;
}

const discountFor = (sub: typeof subscriptions.$inferSelect, on: IsoDate) =>
  sub.discountPercent > 0 && (!sub.discountUntil || sub.discountUntil >= on) ? sub.discountPercent : 0;

export type CheckoutError = "not_configured" | "billing_profile" | "invalid_plan";

/** Pago con link (PSE, Nequi, tarjeta una vez) en el checkout de Wompi de Podium. */
export async function startCheckout(
  database: Database,
  ctx: Ctx,
  input: { planCode: string; interval: Interval },
  deps: { provider: PaymentProvider; keys: ProviderKeys | null; returnUrl: (reference: string) => string },
  now: Date,
): Promise<{ ok: true; url: string; reference: string } | { ok: false; error: CheckoutError }> {
  if (!deps.keys) return { ok: false, error: "not_configured" };
  if (!isPlanCode(input.planCode)) return { ok: false, error: "invalid_plan" };
  const plan = planOf(input.planCode)!;
  const keys = deps.keys;
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [[school], [sub]] = await Promise.all([
      tx.select().from(schools).where(eq(schools.id, ctx.schoolId)),
      tx.select().from(subscriptions).where(eq(subscriptions.schoolId, ctx.schoolId)),
    ]);
    if (!school.legalName || !school.documentNumber || !sub.billingEmail)
      return { ok: false as const, error: "billing_profile" as const };
    const today = todayIn(school.timezone, now);
    // Un solo cobro pendiente a la vez: el nuevo reemplaza al anterior.
    await tx
      .update(platformInvoices)
      .set({ status: "VOID" })
      .where(and(eq(platformInvoices.schoolId, ctx.schoolId), eq(platformInvoices.status, "PENDING")));
    const start = nextStart(sub, school.timezone, today);
    const invoice = await createInvoiceTx(tx, ctx.schoolId, {
      plan,
      interval: input.interval,
      start,
      discountPercent: discountFor(sub, start),
    });
    await tx
      .update(subscriptions)
      .set({ method: sub.method === "CARD" ? "CARD" : "LINK" })
      .where(eq(subscriptions.schoolId, ctx.schoolId));
    await audit(tx, ctx, "subscription.checkout", { reference: invoice.reference, plan: plan.code });
    const url = deps.provider.checkoutUrl(keys, {
      reference: invoice.reference,
      amountInCents: invoice.amount * 100,
      redirectUrl: deps.returnUrl(invoice.reference),
      email: sub.billingEmail,
    });
    return { ok: true as const, url, reference: invoice.reference };
  });
}

export type ApplyResult = "paid" | "pending" | "declined" | "ignored";

/** Aplica el resultado de una transacción de Wompi a la cuenta de Podium (webhook, retorno o cobro). */
export async function applyTransaction(
  database: Database,
  schoolId: string,
  t: ProviderTransaction,
  now: Date,
  mailer?: Mailer,
): Promise<ApplyResult> {
  const outcome = await runInTenant(database, { schoolId }, async (tx) => {
    const [invoice] = await tx
      .select()
      .from(platformInvoices)
      .where(eq(platformInvoices.reference, t.reference));
    if (!invoice || invoice.status === "PAID" || invoice.status === "VOID") return null;
    if (t.status === "PENDING") return { result: "pending" as const };
    if (t.status !== "APPROVED" || t.amountInCents !== invoice.amount * 100) {
      await tx
        .update(platformInvoices)
        .set({ attempts: invoice.attempts + 1, lastAttemptAt: now, providerTransactionId: t.id })
        .where(eq(platformInvoices.id, invoice.id));
      return { result: "declined" as const };
    }
    const [school] = await tx.select().from(schools).where(eq(schools.id, schoolId));
    await tx
      .update(platformInvoices)
      .set({ status: "PAID", paidAt: now, providerTransactionId: t.id })
      .where(eq(platformInvoices.id, invoice.id));
    await tx
      .update(subscriptions)
      .set({
        status: "ACTIVE",
        planCode: invoice.planCode,
        interval: invoice.interval,
        currentPeriodEnd: instantOf(invoice.periodEnd, "23:59", school.timezone),
        pastDueSince: null,
        readOnlySince: null,
        canceledAt: null,
        cancelReason: null,
      })
      .where(eq(subscriptions.schoolId, schoolId));
    await tx.update(schools).set({ status: "ACTIVE" }).where(eq(schools.id, schoolId));
    await audit(tx, { schoolId, actorUserId: null }, "subscription.paid", {
      reference: invoice.reference,
      amount: invoice.amount,
    });
    return { result: "paid" as const, invoice, school };
  });
  if (!outcome) return "ignored";
  if (outcome.result === "paid" && mailer) {
    const owner = await ownerOf(database, schoolId);
    if (owner) {
      const plan = planOf(outcome.invoice.planCode);
      await sendOwnerEmail(mailer, owner, "Recibimos tu pago de Podium", [
        `Hola ${owner.name.split(" ")[0]}, recibimos el pago de ${formatCOP(outcome.invoice.amount)} por el plan ${plan?.name ?? outcome.invoice.planCode} de ${outcome.school.name}.`,
        `Periodo: ${outcome.invoice.periodStart} a ${outcome.invoice.periodEnd}. Referencia ${outcome.invoice.reference}.`,
      ]);
    }
  }
  return outcome.result;
}

/** Webhook del Wompi de Podium: la referencia dice de qué escuela es la cuenta. */
export async function handlePodiumEvent(
  database: Database,
  provider: PaymentProvider,
  keys: ProviderKeys,
  body: unknown,
  now: Date,
  mailer?: Mailer,
): Promise<ApplyResult | "invalid"> {
  const t = provider.parseEvent(keys, body);
  if (!t) return "invalid";
  const rows = await database.execute<{ school_id: string | null }>(
    sql`select platform_invoice_school(${t.reference}) as school_id`,
  );
  const schoolId = rows[0]?.school_id;
  if (!schoolId) return "ignored";
  return applyTransaction(database, schoolId, t, now, mailer);
}

/** Al volver del checkout: consulta la transacción por si el webhook aún no llega. */
export async function reconcileReference(
  database: Database,
  schoolId: string,
  reference: string,
  provider: PaymentProvider,
  keys: ProviderKeys | null,
  now: Date,
  mailer?: Mailer,
): Promise<ApplyResult> {
  if (!keys || !/^POD-[0-9A-F]{12}$/.test(reference)) return "ignored";
  const found = await provider.findByReference(keys, reference).catch(() => []);
  const t = found.find((x) => x.status === "APPROVED") ?? found[0];
  return t ? applyTransaction(database, schoolId, t, now, mailer) : "pending";
}

/** Guarda una tarjeta tokenizada para el cobro automático y cobra el primer periodo. */
export async function subscribeWithCard(
  database: Database,
  ctx: Ctx,
  input: { cardToken: string; planCode: string; interval: Interval },
  deps: { cardApi: CardApi; keys: ProviderKeys | null; mailer?: Mailer },
  now: Date,
): Promise<{ ok: true; result: ApplyResult } | { ok: false; error: CheckoutError | "card" }> {
  if (!deps.keys) return { ok: false, error: "not_configured" };
  if (!isPlanCode(input.planCode)) return { ok: false, error: "invalid_plan" };
  const keys = deps.keys;
  const plan = planOf(input.planCode)!;
  const prepared = await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [[school], [sub]] = await Promise.all([
      tx.select().from(schools).where(eq(schools.id, ctx.schoolId)),
      tx.select().from(subscriptions).where(eq(subscriptions.schoolId, ctx.schoolId)),
    ]);
    return { school, sub };
  });
  const { school, sub } = prepared;
  if (!school.legalName || !school.documentNumber || !sub.billingEmail)
    return { ok: false, error: "billing_profile" };
  let source: { id: string; label: string };
  try {
    source = await deps.cardApi.createPaymentSource(keys, {
      cardToken: input.cardToken,
      email: sub.billingEmail,
    });
  } catch {
    return { ok: false, error: "card" };
  }
  const invoice = await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx
      .update(subscriptions)
      .set({ method: "CARD", paymentSourceId: source.id, cardLabel: source.label })
      .where(eq(subscriptions.schoolId, ctx.schoolId));
    await tx
      .update(platformInvoices)
      .set({ status: "VOID" })
      .where(and(eq(platformInvoices.schoolId, ctx.schoolId), eq(platformInvoices.status, "PENDING")));
    const start = nextStart(sub, school.timezone, todayIn(school.timezone, now));
    const created = await createInvoiceTx(tx, ctx.schoolId, {
      plan,
      interval: input.interval,
      start,
      discountPercent: discountFor(sub, start),
    });
    await audit(tx, ctx, "subscription.card_saved", { card: source.label, reference: created.reference });
    return created;
  });
  const result = await chargeInvoice(database, ctx.schoolId, invoice, source.id, sub.billingEmail, deps, now);
  return { ok: true, result };
}

async function chargeInvoice(
  database: Database,
  schoolId: string,
  invoice: typeof platformInvoices.$inferSelect,
  paymentSourceId: string,
  email: string,
  deps: { cardApi: CardApi; keys: ProviderKeys | null; mailer?: Mailer },
  now: Date,
): Promise<ApplyResult> {
  if (!deps.keys) return "ignored";
  let t: ProviderTransaction;
  try {
    t = await deps.cardApi.charge(deps.keys, {
      paymentSourceId,
      reference: invoice.reference,
      amountInCents: invoice.amount * 100,
      email,
    });
  } catch {
    t = {
      id: "",
      reference: invoice.reference,
      status: "ERROR",
      amountInCents: invoice.amount * 100,
      createdAt: now.toISOString(),
    };
  }
  return applyTransaction(database, schoolId, t, now, deps.mailer);
}

/**
 * Cancelación por el propietario. En prueba (o sin periodo pagado vigente) se cancela de inmediato;
 * si ya pagó, la escuela sigue activa hasta el fin del periodo y luego pasa a CANCELADA.
 */
export async function cancelSubscription(database: Database, ctx: Ctx, reason: string, now: Date) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.schoolId, ctx.schoolId));
    await tx
      .update(platformInvoices)
      .set({ status: "VOID" })
      .where(and(eq(platformInvoices.schoolId, ctx.schoolId), eq(platformInvoices.status, "PENDING")));
    const paidUntil = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : null;
    await tx
      .update(subscriptions)
      .set({
        canceledAt: now,
        cancelReason: reason.slice(0, 500),
        ...(paidUntil ? {} : { status: "CANCELED" as const }),
      })
      .where(eq(subscriptions.schoolId, ctx.schoolId));
    if (!paidUntil) await tx.update(schools).set({ status: "CANCELED" }).where(eq(schools.id, ctx.schoolId));
    await audit(tx, ctx, "subscription.canceled", { reason, effective: paidUntil ?? now });
    return { effective: paidUntil ?? now, immediate: !paidUntil };
  });
}

/** Reactivar una escuela cancelada (dentro de los 90 días de retención): vuelve a solo lectura para pagar. */
export async function reactivateCanceled(database: Database, ctx: Ctx, now: Date) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [school] = await tx.select().from(schools).where(eq(schools.id, ctx.schoolId));
    if (school.status !== "CANCELED") return false;
    await tx.update(schools).set({ status: "READ_ONLY" }).where(eq(schools.id, ctx.schoolId));
    await tx
      .update(subscriptions)
      .set({ status: "PAST_DUE", readOnlySince: now, canceledAt: null, cancelReason: null })
      .where(eq(subscriptions.schoolId, ctx.schoolId));
    await audit(tx, ctx, "subscription.reactivated");
    return true;
  });
}

type Owner = { email: string; name: string };

async function ownerOf(database: Database, schoolId: string): Promise<Owner | null> {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({ email: users.email, name: users.name })
      .from(schools)
      .innerJoin(users, eq(users.id, schools.ownerUserId))
      .where(eq(schools.id, schoolId)),
  );
  return row ?? null;
}

async function sendOwnerEmail(
  mailer: Mailer,
  owner: Owner,
  title: string,
  paragraphs: string[],
  cta?: { label: string; href: string },
) {
  await mailer.send({
    to: owner.email,
    subject: title,
    ...emailLayout({
      brand: PODIUM_BRAND,
      title,
      paragraphs,
      cta,
      footer: "Correo de tu suscripción a Podium.",
    }),
  });
}

export type SubscriptionJobDeps = {
  mailer: Mailer;
  cardApi: CardApi;
  keys: ProviderKeys | null;
  appUrl: string;
};

/**
 * Tarea diaria de la suscripción de una escuela. Idempotente: cada transición deja una marca de tiempo
 * (pastDueSince, readOnlySince…) y los cobros guardan su último intento.
 */
export async function runSubscriptionJob(
  database: Database,
  school: { id: string; slug: string },
  now: Date,
  deps: SubscriptionJobDeps,
): Promise<number> {
  const state = await runInTenant(database, { schoolId: school.id }, async (tx) => {
    const [[row], [sub], pending, active] = await Promise.all([
      tx.select().from(schools).where(eq(schools.id, school.id)),
      tx.select().from(subscriptions).where(eq(subscriptions.schoolId, school.id)),
      tx
        .select()
        .from(platformInvoices)
        .where(and(eq(platformInvoices.schoolId, school.id), eq(platformInvoices.status, "PENDING")))
        .orderBy(desc(platformInvoices.createdAt)),
      countActiveAthletes(tx),
    ]);
    return { school: row, sub, pending, active };
  });
  const { sub, pending, active } = state;
  if (!state.school || state.school.suspendedAt) return 0;
  const tz = state.school.timezone;
  const today = todayIn(tz, now);
  const ctx = { schoolId: school.id, actorUserId: null };
  const url = `${deps.appUrl}/${school.slug}/suscripcion`;
  const owner = await ownerOf(database, school.id);
  const email = async (title: string, lines: string[], label = "Ver mi suscripción") => {
    if (owner)
      await sendOwnerEmail(deps.mailer, owner, title, [`Hola ${owner.name.split(" ")[0]},`, ...lines], {
        label,
        href: url,
      });
  };
  const update = (
    patch: Partial<typeof subscriptions.$inferInsert>,
    status?: (typeof schools.$inferSelect)["status"],
    action?: string,
  ) =>
    runInTenant(database, { schoolId: school.id }, async (tx) => {
      await tx.update(subscriptions).set(patch).where(eq(subscriptions.schoolId, school.id));
      if (status) await tx.update(schools).set({ status }).where(eq(schools.id, school.id));
      if (action) await audit(tx, ctx, action, { status });
    });
  let changes = 0;

  // Límite de alumnos del plan: aviso y, a los 7 días, cambio de plan en el siguiente cobro.
  const plan = planOf(sub.planCode);
  if (plan && (state.school.status === "ACTIVE" || state.school.status === "PAST_DUE")) {
    if (exceedsPlan(plan, active) && !sub.overLimitSince) {
      await update({ overLimitSince: now }, undefined, "subscription.over_limit");
      await email(`Superaste el límite del plan ${plan.name}`, [
        `Tienes ${active} alumnos activos y tu plan incluye hasta ${plan.maxAthletes}. Nunca bloqueamos tu operación: en ${OVER_LIMIT_DAYS} días tu próximo cobro pasará al plan ${planFor(active).name}.`,
      ]);
      changes++;
    } else if (!exceedsPlan(plan, active) && sub.overLimitSince) {
      await update({ overLimitSince: null });
      changes++;
    }
  }

  switch (state.school.status) {
    case "TRIAL": {
      if (state.school.trialEndsAt && state.school.trialEndsAt <= now) {
        await update({ readOnlySince: now }, "READ_ONLY", "subscription.trial_ended");
        await email(
          "Terminó tu prueba de Podium",
          [
            `La prueba de ${state.school.name} terminó. Puedes consultar y exportar tus datos; para seguir creando y editando elige un plan.`,
            "Los pagos de las familias siguen entrando normalmente.",
          ],
          "Elegir plan",
        );
        changes++;
      }
      break;
    }
    case "ACTIVE":
    case "PAST_DUE": {
      if (!sub.currentPeriodEnd) break;
      const periodEnd = isoDateOf(sub.currentPeriodEnd, tz);
      if (sub.canceledAt) {
        if (now > sub.currentPeriodEnd) {
          await update({ status: "CANCELED" }, "CANCELED", "subscription.ended");
          await email("Tu suscripción terminó", [
            `La suscripción de ${state.school.name} terminó. Conservamos tus datos 90 días por si quieres volver.`,
          ]);
          changes++;
        }
        break;
      }
      // Cobro de renovación desde el último día del periodo.
      let invoice = pending[0];
      if (today >= periodEnd && !invoice) {
        const start = addDays(periodEnd, 1);
        const upgrade =
          sub.overLimitSince && daysSince(sub.overLimitSince, now) >= OVER_LIMIT_DAYS
            ? planFor(active)
            : null;
        const nextPlan = upgrade ?? plan ?? planFor(active);
        invoice = await runInTenant(database, { schoolId: school.id }, async (tx) => {
          const created = await createInvoiceTx(tx, school.id, {
            plan: nextPlan,
            interval: sub.interval,
            start,
            discountPercent: discountFor(sub, start),
          });
          await audit(tx, ctx, "subscription.renewal_invoice", {
            reference: created.reference,
            plan: nextPlan.code,
          });
          return created;
        });
        changes++;
        if (sub.method === "CARD" && sub.paymentSourceId && sub.billingEmail) {
          const result = await chargeInvoice(
            database,
            school.id,
            invoice,
            sub.paymentSourceId,
            sub.billingEmail,
            deps,
            now,
          );
          if (result === "paid") break;
        } else {
          await email(
            `Tu suscripción de Podium vence el ${periodEnd}`,
            [`Paga ${formatCOP(invoice.amount)} con PSE, Nequi o tarjeta para seguir sin interrupciones.`],
            "Pagar ahora",
          );
        }
      }
      if (!invoice) break;
      if (state.school.status === "ACTIVE" && now > sub.currentPeriodEnd) {
        await update({ status: "PAST_DUE", pastDueSince: now }, "PAST_DUE", "subscription.past_due");
        await email(
          "No pudimos cobrar tu suscripción",
          [
            `Tienes ${GRACE_DAYS} días para pagar ${formatCOP(invoice.amount)} antes de que ${state.school.name} pase a solo lectura. Los pagos de las familias no se afectan.`,
          ],
          "Pagar ahora",
        );
        changes++;
        break;
      }
      if (state.school.status === "PAST_DUE" && sub.pastDueSince) {
        const days = daysSince(sub.pastDueSince, now);
        if (days >= GRACE_DAYS) {
          await update({ readOnlySince: now }, "READ_ONLY", "subscription.read_only");
          await email(
            `${state.school.name} pasó a solo lectura`,
            ["Puedes consultar y exportar tus datos. Paga la suscripción para volver a crear y editar."],
            "Pagar ahora",
          );
          changes++;
        } else if (
          RETRY_DAYS.includes(days) &&
          sub.method === "CARD" &&
          sub.paymentSourceId &&
          sub.billingEmail &&
          (!invoice.lastAttemptAt || isoDateOf(invoice.lastAttemptAt, tz) !== today)
        ) {
          await chargeInvoice(database, school.id, invoice, sub.paymentSourceId, sub.billingEmail, deps, now);
          changes++;
        }
      }
      break;
    }
    case "READ_ONLY": {
      if (sub.readOnlySince && daysSince(sub.readOnlySince, now) >= READ_ONLY_DAYS) {
        await update({ status: "CANCELED" }, "CANCELED", "subscription.canceled_unpaid");
        await email(`${state.school.name} fue cancelada`, [
          `Pasaron ${READ_ONLY_DAYS} días en solo lectura sin pago. Conservamos tus datos 90 días; puedes reactivar la escuela y pagar para recuperarla.`,
        ]);
        changes++;
      }
      break;
    }
  }
  return changes;
}

/** ¿Se puede crear y editar? (Solo lectura y canceladas no; suspendidas tampoco.) */
export const isWritable = (school: Pick<typeof schools.$inferSelect, "status" | "suspendedAt">) =>
  !school.suspendedAt && school.status !== "READ_ONLY" && school.status !== "CANCELED";
