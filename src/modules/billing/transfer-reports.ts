import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, guardians, paymentReports } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import type { Storage } from "@/lib/storage/types";
import { confirmUpload } from "@/modules/files/files";
import { managerUserIds, notifyUsers, type NotificationInput } from "@/modules/notifications/notify";
import { openInvoices, type Ctx } from "./ledger";
import { createPaymentTx } from "./payments";
import type { BillingPolicy } from "./policy";

/** Transferencias y consignaciones reportadas por la familia, verificadas por la escuela (ADM-34). */

export const transferReportSchema = z.object({
  amount: z.number("Escribe el valor").int().min(1, "El valor debe ser mayor a cero").max(100_000_000),
  paidOn: z.iso.date("Escribe la fecha del pago"),
  method: z.enum(["TRANSFER", "DEPOSIT"]),
  reference: z
    .string()
    .trim()
    .max(80)
    .transform((v) => v || null),
  proofFileId: z.uuid("Adjunta el soporte"),
  invoiceIds: z.array(z.uuid()).max(50).default([]),
});

export type ReportNotice = { input: NotificationInput };
export type TransferReportError = "not_guardian" | "future_date" | "file" | "invalid_invoice";

/**
 * La familia reporta un pago. Va dentro de `asPortalUser` (RLS: solo sus cuentas). Devuelve el aviso para
 * la administración, que se envía fuera del contexto de familia.
 */
export async function reportTransfer(
  database: Database,
  store: Storage,
  ctx: { schoolId: string; userId: string; slug: string; guardianId: string | undefined },
  raw: z.input<typeof transferReportSchema>,
  today: IsoDate,
): Promise<{ ok: true; notice: ReportNotice } | { ok: false; error: TransferReportError }> {
  if (!ctx.guardianId) return { ok: false, error: "not_guardian" };
  const input = transferReportSchema.parse(raw);
  if (input.paidOn > today) return { ok: false, error: "future_date" };
  const file = await confirmUpload(
    database,
    store,
    { schoolId: ctx.schoolId, actorUserId: ctx.userId },
    input.proofFileId,
    "PAYMENT_PROOF",
  );
  if (!file) return { ok: false, error: "file" };
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const open = await openInvoices(tx, ctx.guardianId!);
    if (input.invoiceIds.some((id) => !open.some((o) => o.id === id)))
      return { ok: false as const, error: "invalid_invoice" as const };
    const [guardian] = await tx.select().from(guardians).where(eq(guardians.id, ctx.guardianId!));
    const [report] = await tx
      .insert(paymentReports)
      .values({ schoolId: ctx.schoolId, guardianId: ctx.guardianId!, ...input, reportedByUserId: ctx.userId })
      .returning();
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.userId,
      action: "payment_report.created",
      entity: "payment_report",
      entityId: report.id,
      data: { amount: input.amount, method: input.method },
    });
    return {
      ok: true as const,
      notice: {
        input: {
          kind: "payment_report.created",
          title: `Pago por verificar: ${formatCOP(input.amount)}`,
          body: `${guardian.firstName} ${guardian.lastName} reportó una ${input.method === "TRANSFER" ? "transferencia" : "consignación"} del ${input.paidOn}.`,
          href: `/${ctx.slug}/cobros/pagos/por-verificar`,
          dedupeKey: `payment_report:${report.id}`,
        },
      },
    };
  });
}

/** Avisa a la administración de un reporte nuevo (fuera de `asPortalUser`). */
export function notifyManagers(database: Database, schoolId: string, notice: ReportNotice) {
  return runInTenant(database, { schoolId }, async (tx) =>
    notifyUsers(tx, schoolId, await managerUserIds(tx), notice.input),
  );
}

export function listTransferReports(
  database: Database,
  schoolId: string,
  filter: { status?: "PENDING" | "APPROVED" | "REJECTED"; guardianId?: string } = {},
) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        report: paymentReports,
        guardianName: sql<string>`${guardians.firstName} || ' ' || ${guardians.lastName}`,
      })
      .from(paymentReports)
      .innerJoin(guardians, eq(guardians.id, paymentReports.guardianId))
      .where(
        and(
          filter.status ? eq(paymentReports.status, filter.status) : undefined,
          filter.guardianId ? eq(paymentReports.guardianId, filter.guardianId) : undefined,
        ),
      )
      .orderBy(desc(paymentReports.createdAt))
      .limit(100),
  );
}

export function pendingReportsCount(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(paymentReports)
      .where(eq(paymentReports.status, "PENDING"));
    return row.n;
  });
}

/** Aprobar: crea el pago con el soporte (recibo, aplicación a cuentas y aviso a la familia). */
export function approveTransferReport(
  database: Database,
  ctx: Ctx & { slug: string; actorUserId: string },
  reportId: string,
  policy: BillingPolicy,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [report] = await tx.select().from(paymentReports).where(eq(paymentReports.id, reportId));
    if (!report || report.status !== "PENDING") return { ok: false as const, error: "not_pending" as const };
    // Si alguna cuenta ya se pagó por otro medio, se aplica a las abiertas más antiguas.
    const open = await openInvoices(tx, report.guardianId);
    const invoiceIds = report.invoiceIds.filter((id) => open.some((o) => o.id === id));
    const payment = await createPaymentTx(
      tx,
      ctx,
      {
        guardianId: report.guardianId,
        amount: report.amount,
        paidOn: report.paidOn,
        method: report.method,
        reference: report.reference,
        notes: "Reportado por el acudiente",
        proofFileId: report.proofFileId,
        invoiceIds,
      },
      policy,
    );
    if (!payment.ok) return { ok: false as const, error: payment.error };
    await tx
      .update(paymentReports)
      .set({
        status: "APPROVED",
        reviewedByUserId: ctx.actorUserId,
        reviewedAt: new Date(),
        paymentId: payment.paymentId,
      })
      .where(eq(paymentReports.id, reportId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "payment_report.approved",
      entity: "payment_report",
      entityId: reportId,
      data: { paymentId: payment.paymentId, code: payment.code },
    });
    return { ok: true as const, code: payment.code };
  });
}

export function rejectTransferReport(
  database: Database,
  ctx: Ctx & { slug: string; actorUserId: string },
  reportId: string,
  reason: string,
) {
  const why = z.string().trim().min(3, "Escribe el motivo").max(160).parse(reason);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [report] = await tx.select().from(paymentReports).where(eq(paymentReports.id, reportId));
    if (!report || report.status !== "PENDING") return false;
    await tx
      .update(paymentReports)
      .set({
        status: "REJECTED",
        reviewedByUserId: ctx.actorUserId,
        reviewedAt: new Date(),
        rejectReason: why,
      })
      .where(eq(paymentReports.id, reportId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "payment_report.rejected",
      entity: "payment_report",
      entityId: reportId,
      data: { reason: why },
    });
    const [guardian] = await tx.select().from(guardians).where(eq(guardians.id, report.guardianId));
    await notifyUsers(tx, ctx.schoolId, [guardian?.userId ?? null], {
      kind: "payment_report.rejected",
      title: `No pudimos verificar tu pago de ${formatCOP(report.amount)}`,
      body: `Motivo: ${why}. Escríbele a la escuela si tienes dudas.`,
      href: `/${ctx.slug}/mis-pagos`,
      dedupeKey: `payment_report.rejected:${reportId}`,
    });
    return true;
  });
}
