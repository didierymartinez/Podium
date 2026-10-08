"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { startOnlinePayment } from "@/modules/billing/online";
import { readBillingPolicy } from "@/modules/billing/policy";
import { wompiProvider } from "@/modules/payments/wompi";
import { guardianIdsOfUser } from "@/modules/portal/family";
import { refresh } from "next/cache";
import { formReader } from "@/components/form-data";
import { asPortalUser } from "@/db/portal";
import { parseCOP } from "@/lib/money";
import { storage } from "@/lib/storage";
import { notifyManagers, reportTransfer } from "@/modules/billing/transfer-reports";
import { deliverSoon } from "../../deliver";
import { getActionContext, type ActionState } from "../action-context";

/** El acudiente paga una o varias de sus cuentas en el checkout de Wompi de la escuela (ADM-35). */
export async function payOnlineAction(slug: string, invoiceIds: string[]): Promise<ActionState> {
  const member = await getActionContext(slug, () => true, { allowReadOnly: true });
  if (!member) return { ok: false, message: "Inicia sesión de nuevo." };
  const [guardianId] = await guardianIdsOfUser(db, member.school.id, member.user.id);
  if (!guardianId) return { ok: false, message: "Tu cuenta no está vinculada como acudiente." };
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const result = await startOnlinePayment(
    db,
    wompiProvider(),
    { schoolId: member.school.id, actorUserId: member.user.id },
    {
      guardianId,
      invoiceIds,
      redirectUrl: (reference) => `${origin}/${slug}/mis-pagos?ref=${reference}`,
      email: member.user.email,
    },
    todayIn(member.school.timezone),
    readBillingPolicy(member.school.settings.billing),
  );
  if (!result.ok) {
    const messages = {
      not_connected: "La escuela aún no tiene pagos en línea. Paga por los medios habituales.",
      no_invoices: "Elige al menos una cuenta con saldo.",
      invalid_invoices: "Alguna cuenta ya fue pagada. Recarga la página.",
    };
    return { ok: false, message: messages[result.error] };
  }
  redirect(result.url);
}

/** La familia reporta una transferencia o consignación con su soporte (ADM-34). */
export async function reportTransferAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const member = await getActionContext(slug, () => true, { allowReadOnly: true });
  if (!member) return { ok: false, message: "Inicia sesión de nuevo." };
  const f = formReader(form);
  const amount = parseCOP(f.text("amount"));
  const proofFileId = f.text("proofFileId");
  if (!amount) return { ok: false, errors: { amount: ["Escribe el valor"] } };
  if (!proofFileId) return { ok: false, errors: { proofFileId: ["Adjunta el soporte"] } };
  const result = await asPortalUser(member.user.id, async () => {
    const [guardianId] = await guardianIdsOfUser(db, member.school.id, member.user.id);
    return reportTransfer(
      db,
      storage(),
      { schoolId: member.school.id, userId: member.user.id, slug, guardianId },
      {
        amount,
        paidOn: f.text("paidOn"),
        method: f.text("method") === "DEPOSIT" ? "DEPOSIT" : "TRANSFER",
        reference: f.text("reference"),
        proofFileId,
        invoiceIds: form.getAll("invoiceIds").map(String),
      },
      todayIn(member.school.timezone),
    );
  });
  if (!result.ok) {
    const messages = {
      not_guardian: "Tu cuenta no está vinculada como acudiente.",
      future_date: "La fecha no puede ser futura.",
      file: "No pudimos leer el soporte. Súbelo de nuevo.",
      invalid_invoice: "Alguna cuenta ya fue pagada. Recarga la página.",
    };
    return { ok: false, message: messages[result.error] };
  }
  await notifyManagers(db, member.school.id, result.notice);
  deliverSoon(member.school.id);
  refresh();
  return { ok: true, message: "Recibimos tu reporte. La escuela lo verificará pronto." };
}
