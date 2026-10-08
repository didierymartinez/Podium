"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { startOnlinePayment } from "@/modules/billing/online";
import { readBillingPolicy } from "@/modules/billing/policy";
import { wompiProvider } from "@/modules/payments/wompi";
import { guardianIdsOfUser } from "@/modules/portal/family";
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
