import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { auditLogs, guardians, invoices, paymentAccounts, paymentIntents } from "@/db/schema";
import { decryptField, encryptField } from "@/lib/crypto";
import { isoDateOf, type IsoDate } from "@/lib/dates";
import type { PaymentProvider, ProviderKeys, ProviderTransaction } from "@/modules/payments/provider";
import { balanceOf, earlyPaymentDeadline, type Ctx } from "./ledger";
import type { BillingPolicy } from "./policy";
import { createPaymentTx } from "./payments";
import { adjustmentAmount } from "./pricing";

export const paymentAccountSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
  publicKey: z.string().trim().min(10, "Pega la llave pública"),
  privateKey: z.string().trim().min(10, "Pega la llave privada"),
  eventsSecret: z.string().trim().min(10, "Pega el secreto de eventos"),
  integritySecret: z.string().trim().min(10, "Pega el secreto de integridad"),
});

/** Prueba la conexión y guarda las llaves cifradas (AES-256-GCM, como los datos de salud). */
export async function savePaymentAccount(
  database: Database,
  provider: PaymentProvider,
  ctx: { schoolId: string; actorUserId: string },
  raw: z.input<typeof paymentAccountSchema>,
) {
  const keys = paymentAccountSchema.parse(raw);
  const verified = await provider.verifyAccount(keys);
  if (!verified.ok) return verified;
  await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const values = {
      environment: keys.environment,
      publicKey: keys.publicKey,
      privateKeyEncrypted: encryptField(keys.privateKey)!,
      eventsSecretEncrypted: encryptField(keys.eventsSecret)!,
      integritySecretEncrypted: encryptField(keys.integritySecret)!,
      merchantName: verified.merchantName,
      verifiedAt: new Date(),
    };
    await tx
      .insert(paymentAccounts)
      .values({ schoolId: ctx.schoolId, ...values })
      .onConflictDoUpdate({ target: paymentAccounts.schoolId, set: values });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "payments.account_connected",
      entity: "school",
      entityId: ctx.schoolId,
      data: { environment: keys.environment, publicKey: keys.publicKey, merchant: verified.merchantName },
    });
  });
  return { ok: true as const, merchantName: verified.merchantName };
}

/** Estado visible de la cuenta (sin secretos). */
export async function paymentAccountStatus(database: Database, schoolId: string) {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        environment: paymentAccounts.environment,
        publicKey: paymentAccounts.publicKey,
        merchantName: paymentAccounts.merchantName,
        verifiedAt: paymentAccounts.verifiedAt,
      })
      .from(paymentAccounts),
  );
  return row ?? null;
}

export async function disconnectPaymentAccount(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
) {
  await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.delete(paymentAccounts).where(eq(paymentAccounts.schoolId, ctx.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "payments.account_disconnected",
      entity: "school",
      entityId: ctx.schoolId,
    });
  });
}

async function keysOf(tx: Tx): Promise<ProviderKeys | null> {
  const [row] = await tx.select().from(paymentAccounts);
  if (!row) return null;
  return {
    environment: row.environment as ProviderKeys["environment"],
    publicKey: row.publicKey,
    privateKey: decryptField(row.privateKeyEncrypted)!,
    eventsSecret: decryptField(row.eventsSecretEncrypted)!,
    integritySecret: decryptField(row.integritySecretEncrypted)!,
  };
}

/** Lo que se paga hoy por una cuenta: saldo, menos pronto pago si aplica (ADM-05). */
export function amountDueToday(
  invoice: { total: number; credited: number; paid: number; period: string | null },
  monthlySubtotal: number,
  today: IsoDate,
  policy: BillingPolicy,
) {
  const balance = balanceOf(invoice);
  const deadline = invoice.period ? earlyPaymentDeadline(invoice.period, policy) : null;
  if (!deadline || today > deadline || invoice.paid > 0 || invoice.credited > 0) return balance;
  return balance - adjustmentAmount(monthlySubtotal, policy.earlyPayment);
}

/**
 * Crea el intento de pago de una o varias cuentas del mismo acudiente (ADM-35) y devuelve la URL del
 * checkout. Solo cuentas abiertas; el valor incluye el pronto pago vigente.
 */
export async function startOnlinePayment(
  database: Database,
  provider: PaymentProvider,
  ctx: { schoolId: string; actorUserId: string },
  input: {
    guardianId: string;
    invoiceIds: string[];
    redirectUrl: (reference: string) => string;
    email?: string | null;
  },
  today: IsoDate,
  policy: BillingPolicy,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const keys = await keysOf(tx);
    if (!keys) return { ok: false as const, error: "not_connected" as const };
    const ids = [...new Set(input.invoiceIds)];
    if (ids.length === 0) return { ok: false as const, error: "no_invoices" as const };
    const rows = await tx
      .select({
        invoice: invoices,
        monthly: sql<number>`coalesce((select sum(l.amount) from invoice_lines l where l.invoice_id = ${invoices.id} and l.kind = 'MONTHLY'), 0)::int`,
      })
      .from(invoices)
      .innerJoin(guardians, eq(guardians.id, invoices.guardianId))
      .where(
        and(
          inArray(invoices.id, ids),
          eq(invoices.guardianId, input.guardianId),
          inArray(invoices.status, ["PENDING", "PARTIAL"]),
        ),
      );
    if (rows.length !== ids.length) return { ok: false as const, error: "invalid_invoices" as const };
    const amount = rows.reduce((s, r) => s + amountDueToday(r.invoice, r.monthly, today, policy), 0);
    if (amount <= 0) return { ok: false as const, error: "no_invoices" as const };
    const reference = `PD-${crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
    await tx.insert(paymentIntents).values({
      schoolId: ctx.schoolId,
      guardianId: input.guardianId,
      reference,
      invoiceIds: ids,
      amount,
      createdByUserId: ctx.actorUserId,
    });
    const url = provider.checkoutUrl(keys, {
      reference,
      amountInCents: amount * 100,
      redirectUrl: input.redirectUrl(reference),
      email: input.email,
    });
    return { ok: true as const, url, reference, amount };
  });
}

/**
 * Aplica una transacción de la pasarela (webhook o conciliación). Idempotente: una transacción aprobada
 * crea un solo pago (índice único por id de transacción).
 */
async function applyTransaction(
  tx: Tx,
  ctx: Ctx & { slug: string },
  transaction: ProviderTransaction,
  timeZone: string,
  policy: BillingPolicy,
) {
  const [intent] = await tx
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.reference, transaction.reference));
  if (!intent) return "unknown_reference" as const;
  if (intent.status === "APPROVED") return "already_applied" as const;
  if (transaction.status === "PENDING") return "pending" as const;
  if (transaction.status !== "APPROVED") {
    await tx
      .update(paymentIntents)
      .set({ status: transaction.status, providerTransactionId: transaction.id })
      .where(eq(paymentIntents.id, intent.id));
    return "not_approved" as const;
  }
  if (transaction.amountInCents !== intent.amount * 100) {
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: null,
      action: "payments.amount_mismatch",
      entity: "payment_intent",
      entityId: intent.id,
      data: {
        expected: intent.amount,
        received: transaction.amountInCents / 100,
        transactionId: transaction.id,
      },
    });
  }
  const result = await createPaymentTx(
    tx,
    ctx,
    {
      guardianId: intent.guardianId,
      amount: Math.round(transaction.amountInCents / 100),
      paidOn: isoDateOf(new Date(transaction.createdAt), timeZone),
      method: "ONLINE",
      reference: transaction.id,
      notes: `Wompi · ${transaction.reference}`,
      proofFileId: null,
      providerTransactionId: transaction.id,
      // Si alguna ya no está abierta (pagada por otro medio), el valor queda como saldo a favor.
      invoiceIds: [],
    },
    policy,
  );
  await tx
    .update(paymentIntents)
    .set({
      status: "APPROVED",
      providerTransactionId: transaction.id,
      paymentId: result.ok ? result.paymentId : null,
    })
    .where(eq(paymentIntents.id, intent.id));
  return result.ok ? ("applied" as const) : ("already_applied" as const);
}

/** Webhook de la pasarela: verifica la firma con el secreto de eventos de la escuela. */
export async function handleProviderEvent(
  database: Database,
  provider: PaymentProvider,
  school: { id: string; slug: string; timezone: string },
  body: unknown,
  policy: BillingPolicy,
) {
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    const keys = await keysOf(tx);
    if (!keys) return "not_connected" as const;
    const transaction = provider.parseEvent(keys, body);
    if (!transaction) return "invalid_signature" as const;
    return applyTransaction(
      tx,
      { schoolId: school.id, actorUserId: null, slug: school.slug },
      transaction,
      school.timezone,
      policy,
    );
  });
}

/** Tarea diaria (ADM-33): recupera webhooks perdidos consultando las referencias pendientes de los últimos 3 días. */
export async function reconcileIntents(
  database: Database,
  provider: PaymentProvider,
  school: { id: string; slug: string; timezone: string },
  now: Date,
  policy: BillingPolicy,
) {
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    const keys = await keysOf(tx);
    if (!keys) return 0;
    const pending = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.status, "PENDING"),
          gte(paymentIntents.createdAt, new Date(now.getTime() - 3 * 86_400_000)),
          lt(paymentIntents.createdAt, new Date(now.getTime() - 10 * 60_000)),
        ),
      );
    let applied = 0;
    for (const intent of pending) {
      const transactions = await provider.findByReference(keys, intent.reference).catch(() => []);
      const final =
        transactions.find((t) => t.status === "APPROVED") ?? transactions.find((t) => t.status !== "PENDING");
      if (!final) continue;
      const outcome = await applyTransaction(
        tx,
        { schoolId: school.id, actorUserId: null, slug: school.slug },
        final,
        school.timezone,
        policy,
      );
      if (outcome === "applied") applied++;
    }
    return applied;
  });
}

/** Intentos del acudiente que siguen en verificación (para mostrar "pago en verificación"). */
export function pendingIntents(database: Database, schoolId: string, guardianIds: string[]) {
  if (guardianIds.length === 0) return Promise.resolve([]);
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(paymentIntents)
      .where(and(inArray(paymentIntents.guardianId, guardianIds), eq(paymentIntents.status, "PENDING"))),
  );
}

export function intentByReference(database: Database, schoolId: string, reference: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx.select().from(paymentIntents).where(eq(paymentIntents.reference, reference));
    return row ?? null;
  });
}
