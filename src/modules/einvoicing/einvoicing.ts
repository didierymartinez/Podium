import { and, asc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, einvoiceAccounts, einvoices, guardians, invoiceLines, invoices } from "@/db/schema";
import { decryptField, encryptField } from "@/lib/crypto";
import { FINAL_CONSUMER, type EInvoiceCustomer, type EInvoiceProvider } from "./provider";

/** Facturación electrónica DIAN vía el proveedor de la escuela (ADM-26). */

type Ctx = { schoolId: string; actorUserId: string };

/** Intentos antes de dejar de reintentar solo (la escuela puede reintentar a mano). */
export const MAX_ATTEMPTS = 5;

export const accountSchema = z.object({
  username: z.email("Escribe el correo de la cuenta de Alegra"),
  token: z.string().trim().min(8, "Escribe el token de la API").max(200),
  itemId: z.string().trim().min(1, "Escribe el id del ítem de servicio").max(40),
});

/** Conecta (o actualiza) la cuenta, verificando las credenciales con el proveedor. */
export async function connectAccount(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof accountSchema>,
  provider: EInvoiceProvider,
  now: Date = new Date(),
) {
  const input = accountSchema.parse(raw);
  const check = await provider.verify(input);
  if (!check.ok) return { ok: false as const, error: check.error };
  await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const values = {
      provider: provider.name,
      username: input.username,
      tokenEncrypted: encryptField(input.token)!,
      itemId: input.itemId,
      enabled: true,
      verifiedAt: now,
    };
    await tx
      .insert(einvoiceAccounts)
      .values({ schoolId: ctx.schoolId, ...values })
      .onConflictDoUpdate({ target: einvoiceAccounts.schoolId, set: values });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "einvoicing.connected",
      entity: "school",
      entityId: ctx.schoolId,
      data: { provider: provider.name, username: input.username },
    });
  });
  return { ok: true as const, company: check.company };
}

export function setAccountEnabled(database: Database, ctx: Ctx, enabled: boolean) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.update(einvoiceAccounts).set({ enabled }).where(eq(einvoiceAccounts.schoolId, ctx.schoolId));
  });
}

/** Cuenta sin el token (para mostrar). */
export function getAccount(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx.select().from(einvoiceAccounts).where(eq(einvoiceAccounts.schoolId, schoolId));
    if (!row) return null;
    return {
      provider: row.provider,
      username: row.username,
      itemId: row.itemId,
      enabled: row.enabled,
      verifiedAt: row.verifiedAt,
    };
  });
}

const ID_TYPES: Record<string, EInvoiceCustomer["idType"]> = {
  CC: "CC",
  CE: "CE",
  TI: "TI",
  RC: "RC",
  PASSPORT: "PP",
  PPT: "PP",
};

/**
 * Emite las facturas pendientes: primero encola las cuentas pagadas desde que se conectó el proveedor;
 * luego envía las pendientes y reintenta las fallidas (hasta `MAX_ATTEMPTS`).
 */
export function issuePending(
  database: Database,
  schoolId: string,
  provider: EInvoiceProvider,
  today: string,
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [account] = await tx.select().from(einvoiceAccounts).where(eq(einvoiceAccounts.schoolId, schoolId));
    if (!account || !account.enabled) return 0;
    const token = decryptField(account.tokenEncrypted);
    if (!token) return 0;
    const paid = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.status, "PAID"), gte(invoices.updatedAt, account.createdAt)));
    if (paid.length)
      await tx
        .insert(einvoices)
        .values(paid.map((p) => ({ schoolId, invoiceId: p.id, provider: account.provider })))
        .onConflictDoNothing();
    const queue = await tx
      .select({ e: einvoices, invoice: invoices, guardian: guardians })
      .from(einvoices)
      .innerJoin(invoices, eq(invoices.id, einvoices.invoiceId))
      .innerJoin(guardians, eq(guardians.id, invoices.guardianId))
      .where(
        or(
          eq(einvoices.status, "PENDING"),
          and(eq(einvoices.status, "ERROR"), lt(einvoices.attempts, MAX_ATTEMPTS)),
        ),
      )
      .orderBy(asc(einvoices.createdAt))
      .limit(50);
    if (queue.length === 0) return 0;
    const lines = await tx
      .select()
      .from(invoiceLines)
      .where(
        and(
          inArray(
            invoiceLines.invoiceId,
            queue.map((q) => q.invoice.id),
          ),
          eq(invoiceLines.voided, false),
        ),
      );
    let issued = 0;
    for (const { e, invoice, guardian } of queue) {
      const hasDoc = guardian.documentType && guardian.documentNumber;
      const customer: EInvoiceCustomer = hasDoc
        ? {
            name: `${guardian.firstName} ${guardian.lastName}`,
            idType: ID_TYPES[guardian.documentType!] ?? "CC",
            idNumber: guardian.documentNumber!,
            email: guardian.email,
            phone: guardian.phone,
          }
        : { ...FINAL_CONSUMER, email: guardian.email, phone: guardian.phone };
      const result = await provider.issue(
        { username: account.username, token, itemId: account.itemId },
        {
          date: today,
          dueDate: today,
          customer,
          reference: invoice.code,
          lines: lines
            .filter((l) => l.invoiceId === invoice.id && l.amount > 0)
            .map((l) => ({ description: l.description, amount: l.amount })),
        },
      );
      await tx
        .update(einvoices)
        .set(
          result.ok
            ? {
                status: "ISSUED",
                externalId: result.externalId,
                number: result.number,
                cufe: result.cufe,
                error: null,
                issuedAt: new Date(),
                attempts: e.attempts + 1,
              }
            : { status: "ERROR", error: result.error.slice(0, 300), attempts: e.attempts + 1 },
        )
        .where(eq(einvoices.id, e.id));
      if (result.ok) issued++;
    }
    return issued;
  });
}

/** Reintento manual: vuelve a la cola sin importar los intentos. */
export function retryEInvoice(database: Database, ctx: Ctx, invoiceId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const updated = await tx
      .update(einvoices)
      .set({ status: "PENDING", attempts: 0 })
      .where(and(eq(einvoices.invoiceId, invoiceId), eq(einvoices.status, "ERROR")))
      .returning();
    return updated.length > 0;
  });
}

export function einvoiceFor(database: Database, schoolId: string, invoiceId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx.select().from(einvoices).where(eq(einvoices.invoiceId, invoiceId));
    return row ?? null;
  });
}

export function recentEInvoices(database: Database, schoolId: string, limit = 15) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({ e: einvoices, code: invoices.code, total: invoices.total })
      .from(einvoices)
      .innerJoin(invoices, eq(invoices.id, einvoices.invoiceId))
      .orderBy(asc(einvoices.status), asc(einvoices.createdAt))
      .limit(limit),
  );
}
