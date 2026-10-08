import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";
import { auditLogs, creditNotes, invoiceLines, invoices, paymentAllocations, payments } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import type { BillingPolicy } from "./policy";
import { adjustmentAmount } from "./pricing";

export type Ctx = { schoolId: string; actorUserId: string | null };
export type InvoiceRow = typeof invoices.$inferSelect;

export const codeFor = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;

/** Siguiente consecutivo de cuentas de cobro o recibos, con candado por escuela (sin huecos ni repetidos). */
export async function nextNumber(tx: Tx, schoolId: string, kind: "invoice" | "payment") {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${schoolId}:${kind}`}))`);
  const table = kind === "invoice" ? invoices : payments;
  const [row] = await tx.select({ max: sql<number>`coalesce(max(${table.number}), 0)::int` }).from(table);
  return row.max + 1;
}

export const balanceOf = (inv: Pick<InvoiceRow, "total" | "credited" | "paid">) =>
  inv.total - inv.credited - inv.paid;

/** Recalcula total, notas crédito, pagos aplicados y estado de una cuenta. */
export async function refreshInvoice(tx: Tx, invoiceId: string) {
  const [[lines], [credits], [paid], [current]] = await Promise.all([
    tx
      .select({ sum: sql<number>`coalesce(sum(${invoiceLines.amount}), 0)::int` })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId)),
    tx
      .select({ sum: sql<number>`coalesce(sum(${creditNotes.amount}), 0)::int` })
      .from(creditNotes)
      .where(eq(creditNotes.invoiceId, invoiceId)),
    tx
      .select({ sum: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)::int` })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(and(eq(paymentAllocations.invoiceId, invoiceId), eq(payments.status, "CONFIRMED"))),
    tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, invoiceId)),
  ]);
  const settled = credits.sum + paid.sum;
  const status =
    current.status === "VOID" ? "VOID" : settled >= lines.sum ? "PAID" : settled > 0 ? "PARTIAL" : "PENDING";
  const [row] = await tx
    .update(invoices)
    .set({ total: lines.sum, credited: credits.sum, paid: paid.sum, status })
    .where(eq(invoices.id, invoiceId))
    .returning();
  return row;
}

/** Cuentas abiertas de un acudiente, la más antigua primero (orden de aplicación por defecto, ADM-32). */
export function openInvoices(tx: Tx, guardianId: string) {
  return tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.guardianId, guardianId), inArray(invoices.status, ["PENDING", "PARTIAL"])))
    .orderBy(asc(invoices.dueOn), asc(invoices.number));
}

/** Pagos confirmados con valor sin aplicar (saldo a favor), el más antiguo primero. */
export async function unallocatedPayments(tx: Tx, guardianId: string) {
  const rows = await tx
    .select({
      id: payments.id,
      amount: payments.amount,
      paidOn: payments.paidOn,
      // Calificado a mano: en selects de una sola tabla Drizzle omite el nombre de la tabla.
      allocated: sql<number>`coalesce((select sum(a.amount) from payment_allocations a where a.payment_id = "payments"."id"), 0)::int`,
    })
    .from(payments)
    .where(and(eq(payments.guardianId, guardianId), eq(payments.status, "CONFIRMED")))
    .orderBy(asc(payments.paidOn), asc(payments.number));
  return rows
    .map((r) => ({ id: r.id, paidOn: r.paidOn, remaining: r.amount - r.allocated }))
    .filter((r) => r.remaining > 0);
}

/** Saldo a favor del acudiente: pagos confirmados aún sin aplicar. */
export async function guardianCredit(tx: Tx, guardianId: string) {
  return (await unallocatedPayments(tx, guardianId)).reduce((sum, p) => sum + p.remaining, 0);
}

/** Último día del pronto pago para una cuenta mensual ("2026-10" → "2026-10-05"). */
export function earlyPaymentDeadline(period: string, policy: BillingPolicy): IsoDate | null {
  if (policy.earlyPayment.type === "none") return null;
  return `${period}-${String(policy.earlyPayment.untilDay).padStart(2, "0")}`;
}

/**
 * Aplica un pago a cuentas en el orden dado. Si una mensualidad se paga completa dentro del pronto pago,
 * primero registra la nota crédito del descuento (ADM-05, `amountDueOn`). Devuelve lo que sobró.
 */
export async function allocatePayment(
  tx: Tx,
  ctx: Ctx,
  payment: { id: string; paidOn: IsoDate; remaining: number },
  targets: InvoiceRow[],
  policy: BillingPolicy,
) {
  let remaining = payment.remaining;
  const touched: { invoiceId: string; amount: number }[] = [];
  for (const target of targets) {
    if (remaining <= 0) break;
    let invoice = target;
    const deadline = invoice.period ? earlyPaymentDeadline(invoice.period, policy) : null;
    if (deadline && payment.paidOn <= deadline && invoice.paid === 0 && invoice.credited === 0) {
      const [monthly] = await tx
        .select({ sum: sql<number>`coalesce(sum(${invoiceLines.amount}), 0)::int` })
        .from(invoiceLines)
        .where(and(eq(invoiceLines.invoiceId, invoice.id), eq(invoiceLines.kind, "MONTHLY")));
      const discount = adjustmentAmount(monthly.sum, policy.earlyPayment);
      // Solo si con el descuento queda pagada completa.
      if (discount > 0 && remaining >= balanceOf(invoice) - discount) {
        await tx
          .insert(creditNotes)
          .values({
            schoolId: ctx.schoolId,
            invoiceId: invoice.id,
            kind: "EARLY_PAYMENT",
            amount: discount,
            reason: "Descuento por pronto pago",
            createdByUserId: ctx.actorUserId,
          })
          .onConflictDoNothing();
        invoice = await refreshInvoice(tx, invoice.id);
      }
    }
    const amount = Math.min(remaining, balanceOf(invoice));
    if (amount <= 0) continue;
    await tx.insert(paymentAllocations).values({
      schoolId: ctx.schoolId,
      paymentId: payment.id,
      invoiceId: invoice.id,
      amount,
    });
    await refreshInvoice(tx, invoice.id);
    touched.push({ invoiceId: invoice.id, amount });
    remaining -= amount;
  }
  return { remaining, touched };
}

/** Aplica el saldo a favor del acudiente a sus cuentas abiertas (al generar o anular). */
export async function applyGuardianCredit(tx: Tx, ctx: Ctx, guardianId: string, policy: BillingPolicy) {
  const credit = await unallocatedPayments(tx, guardianId);
  let applied = 0;
  for (const payment of credit) {
    const open = await openInvoices(tx, guardianId);
    if (open.length === 0) break;
    const result = await allocatePayment(tx, ctx, payment, open, policy);
    applied += payment.remaining - result.remaining;
  }
  if (applied > 0) {
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "billing.credit_applied",
      entity: "guardian",
      entityId: guardianId,
      data: { applied },
    });
  }
  return applied;
}
