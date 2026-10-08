import { and, asc, desc, eq, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  athleteGuardians,
  athletes,
  auditLogs,
  creditNotes,
  enrollments,
  feePlans,
  groups,
  guardians,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
} from "@/db/schema";
import { formatCOP } from "@/lib/money";
import type { IsoDate } from "@/lib/dates";
import { notifyUsers } from "@/modules/notifications/notify";
import { applyGuardianCredit, balanceOf, codeFor, nextNumber, refreshInvoice, type Ctx } from "./ledger";
import type { BillingPolicy } from "./policy";
import { firstMonthAmount, monthlyChargeLines } from "./pricing";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
/** "2026-10" → "octubre de 2026" */
export const periodLabel = (period: string) =>
  `${MONTHS[Number(period.slice(5, 7)) - 1]} de ${period.slice(0, 4)}`;
export const periodOf = (date: IsoDate) => date.slice(0, 7);
const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (period: string) =>
  new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate();
const lastDay = (period: string) => `${period}-${pad(daysInMonth(period))}`;
/** Vence el día configurado del mes, pero nunca antes de la emisión. */
const dueOnFor = (period: string, policy: BillingPolicy, issuedOn: IsoDate) => {
  const due = `${period}-${pad(policy.dueDay)}`;
  return due < issuedOn ? issuedOn : due;
};

export type DraftLine = {
  enrollmentId: string;
  athleteId: string;
  athleteName: string;
  description: string;
  baseAmount: number;
  siblingDiscount: number;
  amount: number;
};
export type DraftInvoice = { guardianId: string; guardianName: string; lines: DraftLine[]; total: number };
export type MonthDraft = { invoices: DraftInvoice[]; withoutPayer: { athleteId: string; name: string }[] };

/** Responsable de pago de cada alumno (o el primer acudiente si no hay marcado). */
async function payers(tx: Tx, athleteIds: string[]) {
  if (athleteIds.length === 0) return new Map<string, { id: string; name: string }>();
  const rows = await tx
    .select({
      athleteId: athleteGuardians.athleteId,
      isPayer: athleteGuardians.isPayer,
      guardianId: guardians.id,
      firstName: guardians.firstName,
      lastName: guardians.lastName,
    })
    .from(athleteGuardians)
    .innerJoin(guardians, eq(guardians.id, athleteGuardians.guardianId))
    .where(inArray(athleteGuardians.athleteId, athleteIds))
    .orderBy(desc(athleteGuardians.isPayer), asc(guardians.createdAt));
  const map = new Map<string, { id: string; name: string }>();
  for (const r of rows) {
    if (!map.has(r.athleteId))
      map.set(r.athleteId, { id: r.guardianId, name: `${r.firstName} ${r.lastName}` });
  }
  return map;
}

/**
 * Borrador de las mensualidades de un mes (ADM-20, ADM-22): matrículas activas sin cobro del periodo,
 * agrupadas por responsable de pago, con descuento de hermanos e ingreso a mitad de mes.
 */
async function draftMonthTx(
  tx: Tx,
  period: string,
  policy: BillingPolicy,
  guardianId?: string,
): Promise<MonthDraft> {
  const rows = await tx
    .select({
      enrollmentId: enrollments.id,
      athleteId: athletes.id,
      firstName: athletes.firstName,
      lastName: athletes.lastName,
      startDate: enrollments.startDate,
      groupName: groups.name,
      planName: feePlans.name,
      monthlyAmount: feePlans.monthlyAmount,
      discountPercent: enrollments.discountPercent,
    })
    .from(enrollments)
    .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
    .innerJoin(groups, eq(groups.id, enrollments.groupId))
    .innerJoin(feePlans, eq(feePlans.id, enrollments.feePlanId))
    .where(
      and(
        eq(enrollments.status, "ACTIVE"),
        lte(enrollments.startDate, lastDay(period)),
        sql`not exists (select 1 from invoice_lines l where l.enrollment_id = ${enrollments.id}
            and l.kind = 'MONTHLY' and l.period = ${period} and not l.voided)`,
      ),
    )
    .orderBy(asc(athletes.firstName));
  const payerOf = await payers(tx, [...new Set(rows.map((r) => r.athleteId))]);
  const byPayer = new Map<string, { name: string; items: typeof rows }>();
  const withoutPayer: MonthDraft["withoutPayer"] = [];
  for (const r of rows) {
    const payer = payerOf.get(r.athleteId);
    if (!payer) {
      // Sin responsable de pago no se puede cobrar: se muestra en la vista previa para corregirlo.
      if (!guardianId) withoutPayer.push({ athleteId: r.athleteId, name: `${r.firstName} ${r.lastName}` });
      continue;
    }
    if (guardianId && payer.id !== guardianId) continue;
    const entry = byPayer.get(payer.id) ?? { name: payer.name, items: [] };
    entry.items.push(r);
    byPayer.set(payer.id, entry);
  }
  const drafts: DraftInvoice[] = [];
  for (const [id, { name, items }] of byPayer) {
    const bases = items.map((r) => {
      const joinDay = periodOf(r.startDate) === period ? Number(r.startDate.slice(8, 10)) : 1;
      const monthly = r.monthlyAmount - Math.round((r.monthlyAmount * r.discountPercent) / 100);
      return firstMonthAmount(monthly, joinDay, daysInMonth(period), policy);
    });
    const kept = items.map((r, i) => ({ r, base: bases[i] })).filter((x) => x.base > 0);
    if (kept.length === 0) continue;
    const priced = monthlyChargeLines(
      kept.map(({ r, base }) => ({ label: r.enrollmentId, amount: base })),
      policy,
    );
    const lines = kept.map(({ r, base }, i) => ({
      enrollmentId: r.enrollmentId,
      athleteId: r.athleteId,
      athleteName: `${r.firstName} ${r.lastName}`,
      description:
        `Mensualidad ${periodLabel(period)} · ${r.firstName} · ${r.groupName} (${r.planName})` +
        (r.discountPercent > 0 ? ` · descuento ${r.discountPercent} %` : ""),
      baseAmount: base,
      siblingDiscount: priced[i].siblingDiscount,
      amount: priced[i].total,
    }));
    drafts.push({
      guardianId: id,
      guardianName: name,
      lines,
      total: lines.reduce((s, l) => s + l.amount, 0),
    });
  }
  return {
    invoices: drafts.sort((a, b) => a.guardianName.localeCompare(b.guardianName, "es")),
    withoutPayer,
  };
}

export function previewMonth(database: Database, schoolId: string, period: string, policy: BillingPolicy) {
  return runInTenant(database, { schoolId }, (tx) => draftMonthTx(tx, period, policy));
}

async function createInvoice(
  tx: Tx,
  ctx: Ctx,
  data: {
    guardianId: string;
    period: string | null;
    issuedOn: IsoDate;
    dueOn: IsoDate;
    prefix: string;
    lines: {
      kind: "MONTHLY" | "ENROLLMENT" | "ONE_TIME" | "PREVIOUS_BALANCE";
      athleteId: string | null;
      enrollmentId: string | null;
      description: string;
      baseAmount: number;
      siblingDiscount?: number;
      amount: number;
    }[];
  },
) {
  const number = await nextNumber(tx, ctx.schoolId, "invoice");
  const total = data.lines.reduce((s, l) => s + l.amount, 0);
  const [invoice] = await tx
    .insert(invoices)
    .values({
      schoolId: ctx.schoolId,
      number,
      code: codeFor(data.prefix, number),
      guardianId: data.guardianId,
      period: data.period,
      issuedOn: data.issuedOn,
      dueOn: data.dueOn,
      total,
      status: total === 0 ? "PAID" : "PENDING",
      createdByUserId: ctx.actorUserId,
    })
    .returning();
  await tx.insert(invoiceLines).values(
    data.lines.map((l) => ({
      schoolId: ctx.schoolId,
      invoiceId: invoice.id,
      kind: l.kind,
      athleteId: l.athleteId,
      enrollmentId: l.enrollmentId,
      period: l.kind === "MONTHLY" ? data.period : null,
      description: l.description,
      baseAmount: l.baseAmount,
      siblingDiscount: l.siblingDiscount ?? 0,
      amount: l.amount,
    })),
  );
  return invoice;
}

async function notifyInvoice(
  tx: Tx,
  ctx: Ctx & { slug: string },
  invoice: { id: string; code: string; total: number; dueOn: string; guardianId: string },
  title: string,
) {
  const [guardian] = await tx
    .select({ userId: guardians.userId })
    .from(guardians)
    .where(eq(guardians.id, invoice.guardianId));
  await notifyUsers(tx, ctx.schoolId, [guardian?.userId ?? null], {
    kind: "invoice.created",
    title,
    body: `${invoice.code} por ${formatCOP(invoice.total)}. Vence el ${invoice.dueOn}.`,
    href: `/${ctx.slug}/mis-pagos`,
    dedupeKey: `invoice.created:${invoice.id}`,
  });
}

/** Genera las cuentas del mes (idempotente: lo ya cobrado no se repite) y aplica saldos a favor. */
export function generateMonth(
  database: Database,
  ctx: Ctx & { slug: string },
  period: string,
  today: IsoDate,
  policy: BillingPolicy,
  guardianId?: string,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${ctx.schoolId}:month:${period}`}))`);
    const { invoices: drafts } = await draftMonthTx(tx, period, policy, guardianId);
    let total = 0;
    const created: string[] = [];
    for (const d of drafts) {
      const invoice = await createInvoice(tx, ctx, {
        guardianId: d.guardianId,
        period,
        issuedOn: today,
        dueOn: dueOnFor(period, policy, today),
        prefix: policy.invoicePrefix,
        lines: d.lines.map((l) => ({ kind: "MONTHLY" as const, ...l })),
      });
      await applyGuardianCredit(tx, ctx, d.guardianId, policy);
      await notifyInvoice(tx, ctx, invoice, `Tu cuenta de cobro de ${periodLabel(period)} está lista`);
      total += invoice.total;
      created.push(invoice.id);
    }
    if (created.length) {
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.actorUserId,
        action: "billing.month_generated",
        entity: "school",
        entityId: ctx.schoolId,
        data: { period, invoices: created.length, total },
      });
    }
    return { invoices: created.length, total, ids: created };
  });
}

export const oneTimeChargeSchema = z.object({
  athleteIds: z.array(z.uuid()).min(1, "Elige al menos un alumno").max(500),
  description: z.string().trim().min(3, "Escribe el concepto").max(120),
  amount: z.number("Escribe el valor").int().min(1, "El valor debe ser mayor a cero").max(50_000_000),
  dueOn: z.iso.date("Escribe la fecha de vencimiento"),
  kind: z.enum(["ONE_TIME", "PREVIOUS_BALANCE"]).default("ONE_TIME"),
});

/** Cobros únicos (uniforme, evento, saldo anterior) a uno o varios alumnos: una cuenta por responsable (ADM-21). */
export function chargeOneTime(
  database: Database,
  ctx: Ctx & { slug: string },
  raw: z.input<typeof oneTimeChargeSchema>,
  today: IsoDate,
  policy: BillingPolicy,
) {
  const input = oneTimeChargeSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const ids = [...new Set(input.athleteIds)];
    const rows = await tx
      .select({ id: athletes.id, firstName: athletes.firstName })
      .from(athletes)
      .where(inArray(athletes.id, ids));
    if (rows.length !== ids.length) return { ok: false as const, error: "invalid_reference" as const };
    const payerOf = await payers(tx, ids);
    const byPayer = new Map<string, typeof rows>();
    for (const a of rows) {
      const payer = payerOf.get(a.id);
      if (!payer) return { ok: false as const, error: "no_payer" as const };
      byPayer.set(payer.id, [...(byPayer.get(payer.id) ?? []), a]);
    }
    const created: string[] = [];
    for (const [guardianId, list] of byPayer) {
      const invoice = await createInvoice(tx, ctx, {
        guardianId,
        period: null,
        issuedOn: today,
        dueOn: input.dueOn < today ? today : input.dueOn,
        prefix: policy.invoicePrefix,
        lines: list.map((a) => ({
          kind: input.kind,
          athleteId: a.id,
          enrollmentId: null,
          description: `${input.description} · ${a.firstName}`,
          baseAmount: input.amount,
          amount: input.amount,
        })),
      });
      await applyGuardianCredit(tx, ctx, guardianId, policy);
      await notifyInvoice(tx, ctx, invoice, `Nuevo cobro: ${input.description}`);
      created.push(invoice.id);
    }
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "billing.one_time_charge",
      entity: "school",
      entityId: ctx.schoolId,
      data: { ...input, invoices: created },
    });
    return { ok: true as const, invoiceIds: created };
  });
}

/**
 * Cobra un valor por alumno agrupando por responsable de pago (una cuenta por familia), dentro de la
 * transacción del llamador. Lo usa la re-matrícula anual (ADM-18). Devuelve la cuenta de cada alumno.
 */
export async function chargePerAthleteTx(
  tx: Tx,
  ctx: Ctx & { slug: string },
  items: { athleteId: string; firstName: string }[],
  charge: {
    kind: "ENROLLMENT" | "ONE_TIME";
    description: string;
    amount: number;
    dueOn: IsoDate;
    today: IsoDate;
  },
  policy: BillingPolicy,
) {
  const payerOf = await payers(
    tx,
    items.map((i) => i.athleteId),
  );
  const byPayer = new Map<string, typeof items>();
  for (const item of items) {
    const payer = payerOf.get(item.athleteId);
    if (payer) byPayer.set(payer.id, [...(byPayer.get(payer.id) ?? []), item]);
  }
  const invoiceOf = new Map<string, string>();
  for (const [guardianId, list] of byPayer) {
    const invoice = await createInvoice(tx, ctx, {
      guardianId,
      period: null,
      issuedOn: charge.today,
      dueOn: charge.dueOn < charge.today ? charge.today : charge.dueOn,
      prefix: policy.invoicePrefix,
      lines: list.map((a) => ({
        kind: charge.kind,
        athleteId: a.athleteId,
        enrollmentId: null,
        description: `${charge.description} · ${a.firstName}`,
        baseAmount: charge.amount,
        amount: charge.amount,
      })),
    });
    await applyGuardianCredit(tx, ctx, guardianId, policy);
    await notifyInvoice(tx, ctx, invoice, charge.description);
    for (const a of list) invoiceOf.set(a.athleteId, invoice.id);
  }
  return invoiceOf;
}

/** Cobro de matrícula al matricular (ADM-12), si la política lo define. Una vez por matrícula. */
export function chargeEnrollmentFee(
  database: Database,
  ctx: Ctx & { slug: string },
  enrollmentId: string,
  today: IsoDate,
  policy: BillingPolicy,
) {
  if (policy.enrollmentFee <= 0) return Promise.resolve(null);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .select({
        enrollmentId: enrollments.id,
        athleteId: athletes.id,
        firstName: athletes.firstName,
        groupName: groups.name,
      })
      .from(enrollments)
      .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
      .innerJoin(groups, eq(groups.id, enrollments.groupId))
      .where(eq(enrollments.id, enrollmentId));
    if (!row) return null;
    const [existing] = await tx
      .select({ id: invoiceLines.id })
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.enrollmentId, enrollmentId),
          eq(invoiceLines.kind, "ENROLLMENT"),
          eq(invoiceLines.voided, false),
        ),
      );
    if (existing) return null;
    const payer = (await payers(tx, [row.athleteId])).get(row.athleteId);
    if (!payer) return null;
    const invoice = await createInvoice(tx, ctx, {
      guardianId: payer.id,
      period: null,
      issuedOn: today,
      dueOn: today,
      prefix: policy.invoicePrefix,
      lines: [
        {
          kind: "ENROLLMENT",
          athleteId: row.athleteId,
          enrollmentId,
          description: `Matrícula · ${row.firstName} · ${row.groupName}`,
          baseAmount: policy.enrollmentFee,
          amount: policy.enrollmentFee,
        },
      ],
    });
    await applyGuardianCredit(tx, ctx, payer.id, policy);
    await notifyInvoice(tx, ctx, invoice, "Cobro de matrícula");
    return invoice.id;
  });
}

/**
 * Saldo anterior al empezar a usar Podium (importación, #23): una cuenta "Saldo anterior" por responsable de pago.
 * Corre dentro de la transacción del llamador; no notifica a la familia.
 */
export async function chargePreviousBalanceTx(
  tx: Tx,
  ctx: Ctx,
  data: {
    guardianId: string;
    items: { athleteId: string; firstName: string; amount: number }[];
    today: IsoDate;
  },
  policy: BillingPolicy,
) {
  const invoice = await createInvoice(tx, ctx, {
    guardianId: data.guardianId,
    period: null,
    issuedOn: data.today,
    dueOn: data.today,
    prefix: policy.invoicePrefix,
    lines: data.items.map((i) => ({
      kind: "PREVIOUS_BALANCE" as const,
      athleteId: i.athleteId,
      enrollmentId: null,
      description: `Saldo anterior · ${i.firstName}`,
      baseAmount: i.amount,
      amount: i.amount,
    })),
  });
  return invoice.id;
}

/** Tarea diaria (ADM-23): agrega el recargo por mora una vez a cada mensualidad vencida con saldo. */
export function addLateFees(
  database: Database,
  ctx: Ctx & { slug: string },
  today: IsoDate,
  policy: BillingPolicy,
) {
  if (policy.lateFee.type === "none") return Promise.resolve(0);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const overdue = await tx
      .select()
      .from(invoices)
      .where(
        and(
          inArray(invoices.status, ["PENDING", "PARTIAL"]),
          lt(invoices.dueOn, today),
          sql`${invoices.period} is not null`,
          sql`not exists (select 1 from invoice_lines l where l.invoice_id = "invoices"."id" and l.kind = 'LATE_FEE')`,
        ),
      );
    let added = 0;
    for (const inv of overdue) {
      const [monthly] = await tx
        .select({ sum: sql<number>`coalesce(sum(${invoiceLines.amount}), 0)::int` })
        .from(invoiceLines)
        .where(and(eq(invoiceLines.invoiceId, inv.id), eq(invoiceLines.kind, "MONTHLY")));
      const fee =
        policy.lateFee.type === "percent"
          ? Math.round((monthly.sum * policy.lateFee.value) / 100)
          : policy.lateFee.value;
      if (fee <= 0) continue;
      await tx.insert(invoiceLines).values({
        schoolId: ctx.schoolId,
        invoiceId: inv.id,
        kind: "LATE_FEE",
        description: "Recargo por mora",
        baseAmount: fee,
        amount: fee,
      });
      const updated = await refreshInvoice(tx, inv.id);
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: null,
        action: "billing.late_fee",
        entity: "invoice",
        entityId: inv.id,
        data: { fee, date: today },
      });
      const [guardian] = await tx
        .select({ userId: guardians.userId })
        .from(guardians)
        .where(eq(guardians.id, inv.guardianId));
      await notifyUsers(tx, ctx.schoolId, [guardian?.userId ?? null], {
        kind: "invoice.late_fee",
        title: `Se sumó el recargo por mora a ${inv.code}`,
        body: `Recargo de ${formatCOP(fee)}. Saldo: ${formatCOP(balanceOf(updated))}.`,
        href: `/${ctx.slug}/mis-pagos`,
        dedupeKey: `invoice.late_fee:${inv.id}`,
      });
      added++;
    }
    return added;
  });
}

export const creditNoteSchema = z.object({
  amount: z.number("Escribe el valor").int().min(1, "El valor debe ser mayor a cero"),
  reason: z.string().trim().min(3, "Escribe el motivo").max(160),
});

/** Nota crédito / ajuste sobre una cuenta emitida (ADM-24). Nunca deja saldo negativo. */
export function addCreditNote(
  database: Database,
  ctx: Ctx,
  invoiceId: string,
  raw: z.input<typeof creditNoteSchema>,
) {
  const input = creditNoteSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv || inv.status === "VOID") return { ok: false as const, error: "not_found" as const };
    if (input.amount > balanceOf(inv)) return { ok: false as const, error: "exceeds_balance" as const };
    await tx.insert(creditNotes).values({
      schoolId: ctx.schoolId,
      invoiceId,
      kind: "ADJUSTMENT",
      amount: input.amount,
      reason: input.reason,
      createdByUserId: ctx.actorUserId,
    });
    await refreshInvoice(tx, invoiceId);
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "invoice.credit_note",
      entity: "invoice",
      entityId: invoiceId,
      data: input,
    });
    return { ok: true as const };
  });
}

/**
 * Anula una cuenta (solo administración, con motivo). Los pagos que tenía aplicados vuelven a ser
 * saldo a favor y se aplican a otras cuentas abiertas (§7.4).
 */
export function voidInvoice(
  database: Database,
  ctx: Ctx,
  invoiceId: string,
  reason: string,
  policy: BillingPolicy,
) {
  const why = z.string().trim().min(3, "Escribe el motivo").max(160).parse(reason);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv || inv.status === "VOID") return false;
    const released = await tx
      .delete(paymentAllocations)
      .where(eq(paymentAllocations.invoiceId, invoiceId))
      .returning({ paymentId: paymentAllocations.paymentId, amount: paymentAllocations.amount });
    await tx.update(invoiceLines).set({ voided: true }).where(eq(invoiceLines.invoiceId, invoiceId));
    await tx
      .update(invoices)
      .set({ status: "VOID", voidReason: why, voidedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
    await refreshInvoice(tx, invoiceId);
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "invoice.voided",
      entity: "invoice",
      entityId: invoiceId,
      data: { reason: why, code: inv.code, total: inv.total, releasedAllocations: released },
    });
    if (released.length) await applyGuardianCredit(tx, ctx, inv.guardianId, policy);
    return true;
  });
}

/** Regenera una mensualidad corregida (ADM-22): anula la cuenta sin pagos y la vuelve a generar. */
export async function regenerateInvoice(
  database: Database,
  ctx: Ctx & { slug: string },
  invoiceId: string,
  today: IsoDate,
  policy: BillingPolicy,
) {
  const inv = await getInvoiceRow(database, ctx.schoolId, invoiceId);
  if (!inv || !inv.period || inv.status === "VOID" || inv.paid > 0) return { ok: false as const };
  await voidInvoice(database, ctx, invoiceId, "Regenerada por corrección de la matrícula", policy);
  const result = await generateMonth(database, ctx, inv.period, today, policy, inv.guardianId);
  return { ok: true as const, invoiceId: result.ids[0] ?? null };
}

async function getInvoiceRow(database: Database, schoolId: string, invoiceId: string) {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx.select().from(invoices).where(eq(invoices.id, invoiceId)),
  );
  return row ?? null;
}

export type InvoiceListItem = Awaited<ReturnType<typeof listInvoices>>[number];

export function listInvoices(
  database: Database,
  schoolId: string,
  filter: {
    status?: "open" | "PAID" | "VOID" | "overdue";
    period?: string;
    guardianId?: string;
    today: IsoDate;
  },
) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        id: invoices.id,
        code: invoices.code,
        period: invoices.period,
        issuedOn: invoices.issuedOn,
        dueOn: invoices.dueOn,
        status: invoices.status,
        total: invoices.total,
        credited: invoices.credited,
        paid: invoices.paid,
        guardianId: guardians.id,
        guardianName: sql<string>`${guardians.firstName} || ' ' || ${guardians.lastName}`,
        guardianPhone: guardians.phone,
      })
      .from(invoices)
      .innerJoin(guardians, eq(guardians.id, invoices.guardianId))
      .where(
        and(
          filter.status === "open"
            ? inArray(invoices.status, ["PENDING", "PARTIAL"])
            : filter.status === "overdue"
              ? and(inArray(invoices.status, ["PENDING", "PARTIAL"]), lt(invoices.dueOn, filter.today))
              : filter.status
                ? eq(invoices.status, filter.status)
                : undefined,
          filter.period ? eq(invoices.period, filter.period) : undefined,
          filter.guardianId ? eq(invoices.guardianId, filter.guardianId) : undefined,
        ),
      )
      .orderBy(desc(invoices.number))
      .limit(500),
  );
}

export function getInvoice(database: Database, schoolId: string, invoiceId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx
      .select({ invoice: invoices, guardian: guardians })
      .from(invoices)
      .innerJoin(guardians, eq(guardians.id, invoices.guardianId))
      .where(eq(invoices.id, invoiceId));
    if (!row) return null;
    const [lines, notes, allocations] = await Promise.all([
      tx
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoiceId))
        .orderBy(asc(invoiceLines.createdAt)),
      tx
        .select()
        .from(creditNotes)
        .where(eq(creditNotes.invoiceId, invoiceId))
        .orderBy(asc(creditNotes.createdAt)),
      tx
        .select({
          id: paymentAllocations.id,
          amount: paymentAllocations.amount,
          paymentId: payments.id,
          code: payments.code,
          paidOn: payments.paidOn,
          method: payments.method,
        })
        .from(paymentAllocations)
        .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
        .where(and(eq(paymentAllocations.invoiceId, invoiceId), ne(payments.status, "VOID"))),
    ]);
    return { ...row, lines, creditNotes: notes, allocations };
  });
}
