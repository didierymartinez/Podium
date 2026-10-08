import { eq } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { files, schools } from "@/db/schema";
import { todayIn } from "@/lib/dates";
import type { Storage } from "@/lib/storage/types";
import { DOCUMENT_TYPE_LABELS } from "@/modules/athletes/schemas";
import { getGuardian } from "@/modules/athletes/guardians";
import { getInvoice } from "./invoices";
import { balanceOf } from "./ledger";
import { getPayment, PAYMENT_METHOD_LABELS } from "./payments";
import { clearancePdf, invoicePdf, receiptPdf, statementPdf, type SchoolHeader } from "./pdf";
import { guardianStatement } from "./statement";

export const INVOICE_STATUS_LABELS = {
  PENDING: "Pendiente",
  PARTIAL: "Abono parcial",
  PAID: "Pagada",
  VOID: "Anulada",
} as const;

export type PdfKind = "cuenta" | "recibo" | "estado" | "paz-y-salvo";

export async function schoolHeader(
  database: Database,
  store: Storage,
  schoolId: string,
): Promise<SchoolHeader & { slug: string; timezone: string }> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [school] = await tx.select().from(schools).where(eq(schools.id, schoolId));
    let logo: SchoolHeader["logo"] = null;
    if (school.logoFileId) {
      const [file] = await tx.select().from(files).where(eq(files.id, school.logoFileId));
      const bytes = file ? await store.read(file.storageKey).catch(() => null) : null;
      if (file && bytes) logo = { bytes, contentType: file.contentType };
    }
    return {
      slug: school.slug,
      timezone: school.timezone,
      name: school.name,
      legalName: school.legalName,
      documentNumber: school.documentNumber,
      address: school.address,
      city: school.city,
      phone: school.phone,
      email: school.contactEmail,
      brandColor: school.brandColor,
      logo,
    };
  });
}

const documentOf = (g: { documentType: string | null; documentNumber: string | null }) =>
  g.documentNumber
    ? `${g.documentType ? DOCUMENT_TYPE_LABELS[g.documentType as keyof typeof DOCUMENT_TYPE_LABELS] : ""} ${g.documentNumber}`.trim()
    : null;

/**
 * Genera el PDF pedido. `ownerGuardianIds` limita a documentos de esos acudientes (familias);
 * la administración pasa null. Devuelve null si no existe o no corresponde.
 */
export async function billingPdf(
  database: Database,
  store: Storage,
  schoolId: string,
  kind: PdfKind,
  id: string,
  ownerGuardianIds: string[] | null,
  appUrl: string,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const school = await schoolHeader(database, store, schoolId);
  const today = todayIn(school.timezone);
  const allowed = (guardianId: string) => ownerGuardianIds === null || ownerGuardianIds.includes(guardianId);
  const payUrl = `${appUrl}/${school.slug}/mis-pagos`;

  if (kind === "cuenta") {
    const data = await getInvoice(database, schoolId, id);
    if (!data || !allowed(data.guardian.id)) return null;
    const { invoice, guardian } = data;
    return {
      filename: `${invoice.code}.pdf`,
      bytes: await invoicePdf({
        school,
        code: invoice.code,
        status: INVOICE_STATUS_LABELS[invoice.status],
        issuedOn: invoice.issuedOn,
        dueOn: invoice.dueOn,
        guardian: {
          name: `${guardian.firstName} ${guardian.lastName}`,
          document: documentOf(guardian),
          phone: guardian.phone,
        },
        lines: data.lines,
        creditNotes: data.creditNotes,
        payments: data.allocations,
        total: invoice.total,
        balance: invoice.status === "VOID" ? 0 : balanceOf(invoice),
        payUrl,
        today,
      }),
    };
  }
  if (kind === "recibo") {
    const data = await getPayment(database, schoolId, id);
    if (!data || !allowed(data.guardian.id)) return null;
    return {
      filename: `${data.payment.code}.pdf`,
      bytes: await receiptPdf({
        school,
        code: data.payment.code,
        paidOn: data.payment.paidOn,
        method: PAYMENT_METHOD_LABELS[data.payment.method],
        reference: data.payment.reference,
        amount: data.payment.amount,
        guardian: {
          name: `${data.guardian.firstName} ${data.guardian.lastName}`,
          document: documentOf(data.guardian),
        },
        allocations: data.allocations,
        credit: data.credit,
        voided: data.payment.status === "VOID",
        today,
      }),
    };
  }
  if (!allowed(id)) return null;
  const statement = await guardianStatement(database, schoolId, id);
  if (!statement) return null;
  const g = statement.guardian;
  const name = `${g.firstName} ${g.lastName}`;
  if (kind === "estado") {
    return {
      filename: `estado-de-cuenta-${today}.pdf`,
      bytes: await statementPdf({
        school,
        guardian: { name, document: documentOf(g), phone: g.phone },
        movements: statement.movements,
        owed: statement.owed,
        credit: statement.credit,
        today,
      }),
    };
  }
  if (statement.owed > 0) return null;
  const detail = await getGuardian(database, schoolId, id);
  return {
    filename: `paz-y-salvo-${today}.pdf`,
    bytes: await clearancePdf({
      school,
      guardian: { name, document: documentOf(g) },
      athletes: (detail?.athletes ?? []).map((a) => `${a.firstName} ${a.lastName}`),
      today,
    }),
  };
}
