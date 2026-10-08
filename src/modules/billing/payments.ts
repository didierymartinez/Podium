import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { auditLogs, guardians, invoices, paymentAllocations, payments } from "@/db/schema";
import { formatCOP } from "@/lib/money";
import type { IsoDate } from "@/lib/dates";
import type { Storage } from "@/lib/storage/types";
import { confirmUpload } from "@/modules/files/files";
import { notifyUsers } from "@/modules/notifications/notify";
import {
  allocatePayment,
  applyGuardianCredit,
  codeFor,
  nextNumber,
  openInvoices,
  refreshInvoice,
  type Ctx,
} from "./ledger";
import type { BillingPolicy } from "./policy";

export const PAYMENT_METHOD_LABELS = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  DEPOSIT: "Consignación",
  CARD: "Datáfono",
  ONLINE: "En línea",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHOD_LABELS;

export const manualPaymentSchema = z.object({
  guardianId: z.uuid("Elige el acudiente"),
  amount: z.number("Escribe el valor").int().min(1, "El valor debe ser mayor a cero").max(100_000_000),
  paidOn: z.iso.date("Escribe la fecha del pago"),
  method: z.enum(["CASH", "TRANSFER", "DEPOSIT", "CARD"]),
  reference: z.string().trim().max(80).nullable(),
  notes: z.string().trim().max(200).nullable(),
  proofFileId: z.uuid().nullable(),
  /** Cuentas a las que se aplica, en orden. Vacío: la más antigua primero. */
  invoiceIds: z.array(z.uuid()).max(50).default([]),
});
export type ManualPaymentInput = z.input<typeof manualPaymentSchema>;

type PaymentResult =
  | { ok: true; paymentId: string; code: string; applied: number; credit: number }
  | { ok: false; error: "not_found" | "future_date" | "file" | "invalid_invoice" | "duplicate" };

/** Crea el pago, lo aplica y deja el resto como saldo a favor. Compartido por pagos manuales y en línea. */
export async function createPaymentTx(
  tx: Tx,
  ctx: Ctx & { slug: string },
  data: {
    guardianId: string;
    amount: number;
    paidOn: IsoDate;
    method: PaymentMethod;
    reference: string | null;
    notes: string | null;
    proofFileId: string | null;
    providerTransactionId?: string | null;
    invoiceIds: string[];
  },
  policy: BillingPolicy,
): Promise<PaymentResult> {
  const [guardian] = await tx.select().from(guardians).where(eq(guardians.id, data.guardianId));
  if (!guardian) return { ok: false, error: "not_found" };
  let targets = await openInvoices(tx, data.guardianId);
  if (data.invoiceIds.length) {
    const chosen = data.invoiceIds.map((id) => targets.find((t) => t.id === id));
    if (chosen.some((c) => !c)) return { ok: false, error: "invalid_invoice" };
    targets = chosen as typeof targets;
  }
  const number = await nextNumber(tx, ctx.schoolId, "payment");
  const [payment] = await tx
    .insert(payments)
    .values({
      schoolId: ctx.schoolId,
      number,
      code: codeFor(policy.receiptPrefix, number),
      guardianId: data.guardianId,
      amount: data.amount,
      paidOn: data.paidOn,
      method: data.method,
      reference: data.reference,
      notes: data.notes,
      proofFileId: data.proofFileId,
      providerTransactionId: data.providerTransactionId ?? null,
      recordedByUserId: ctx.actorUserId,
    })
    .onConflictDoNothing()
    .returning();
  if (!payment) return { ok: false, error: "duplicate" };
  const { remaining } = await allocatePayment(
    tx,
    ctx,
    { id: payment.id, paidOn: data.paidOn, remaining: data.amount },
    targets,
    policy,
  );
  await tx.insert(auditLogs).values({
    schoolId: ctx.schoolId,
    actorUserId: ctx.actorUserId,
    action: "payment.recorded",
    entity: "payment",
    entityId: payment.id,
    data: { code: payment.code, amount: data.amount, method: data.method, credit: remaining },
  });
  await notifyUsers(tx, ctx.schoolId, [guardian.userId], {
    kind: "payment.received",
    title: `Recibimos tu pago de ${formatCOP(data.amount)}`,
    body: `Recibo ${payment.code}.${remaining > 0 ? ` Quedó un saldo a favor de ${formatCOP(remaining)}.` : ""}`,
    href: `/${ctx.slug}/mis-pagos`,
    dedupeKey: `payment.received:${payment.id}`,
  });
  return {
    ok: true,
    paymentId: payment.id,
    code: payment.code,
    applied: data.amount - remaining,
    credit: remaining,
  };
}

/** Pago manual (efectivo, transferencia, consignación, datáfono) con soporte y recibo de caja (ADM-31). */
export async function recordPayment(
  database: Database,
  store: Storage,
  ctx: Ctx & { slug: string; actorUserId: string },
  raw: ManualPaymentInput,
  today: IsoDate,
  policy: BillingPolicy,
): Promise<PaymentResult> {
  const input = manualPaymentSchema.parse(raw);
  if (input.paidOn > today) return { ok: false, error: "future_date" };
  if (input.proofFileId && !(await confirmUpload(database, store, ctx, input.proofFileId, "PAYMENT_PROOF"))) {
    return { ok: false, error: "file" };
  }
  return runInTenant(database, { schoolId: ctx.schoolId }, (tx) => createPaymentTx(tx, ctx, input, policy));
}

/** Anula un pago (solo administración, con motivo): revierte sus aplicaciones (§7.4). */
export function voidPayment(
  database: Database,
  ctx: Ctx,
  paymentId: string,
  reason: string,
  policy: BillingPolicy,
) {
  const why = z.string().trim().min(3, "Escribe el motivo").max(160).parse(reason);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId));
    if (!payment || payment.status === "VOID") return false;
    const released = await tx
      .delete(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId))
      .returning({ invoiceId: paymentAllocations.invoiceId, amount: paymentAllocations.amount });
    await tx
      .update(payments)
      .set({ status: "VOID", voidReason: why, voidedAt: new Date() })
      .where(eq(payments.id, paymentId));
    for (const r of released) await refreshInvoice(tx, r.invoiceId);
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "payment.voided",
      entity: "payment",
      entityId: paymentId,
      data: { reason: why, code: payment.code, amount: payment.amount, releasedAllocations: released },
    });
    // Otros pagos con saldo a favor pueden cubrir lo que quedó abierto.
    await applyGuardianCredit(tx, ctx, payment.guardianId, policy);
    return true;
  });
}

export function listPayments(
  database: Database,
  schoolId: string,
  filter: { from?: IsoDate; to?: IsoDate; guardianId?: string } = {},
) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        id: payments.id,
        code: payments.code,
        amount: payments.amount,
        paidOn: payments.paidOn,
        method: payments.method,
        status: payments.status,
        reference: payments.reference,
        guardianId: guardians.id,
        guardianName: sql<string>`${guardians.firstName} || ' ' || ${guardians.lastName}`,
      })
      .from(payments)
      .innerJoin(guardians, eq(guardians.id, payments.guardianId))
      .where(
        and(
          filter.from ? sql`${payments.paidOn} >= ${filter.from}` : undefined,
          filter.to ? sql`${payments.paidOn} <= ${filter.to}` : undefined,
          filter.guardianId ? eq(payments.guardianId, filter.guardianId) : undefined,
        ),
      )
      .orderBy(desc(payments.number))
      .limit(500),
  );
}

export function getPayment(database: Database, schoolId: string, paymentId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx
      .select({ payment: payments, guardian: guardians })
      .from(payments)
      .innerJoin(guardians, eq(guardians.id, payments.guardianId))
      .where(eq(payments.id, paymentId));
    if (!row) return null;
    const allocations = await tx
      .select({
        amount: paymentAllocations.amount,
        invoiceId: invoices.id,
        code: invoices.code,
        period: invoices.period,
      })
      .from(paymentAllocations)
      .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
      .where(eq(paymentAllocations.paymentId, paymentId))
      .orderBy(asc(invoices.number));
    const applied = allocations.reduce((s, a) => s + a.amount, 0);
    return { ...row, allocations, credit: row.payment.status === "VOID" ? 0 : row.payment.amount - applied };
  });
}
