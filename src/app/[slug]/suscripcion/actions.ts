"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { formReader } from "@/components/form-data";
import { db } from "@/db/client";
import { mailer } from "@/lib/mailer";
import { wompiProvider } from "@/modules/payments/wompi";
import { canManageSubscription } from "@/modules/schools/permissions";
import { podiumPaymentKeys, wompiCardApi } from "@/modules/subscription/podium-wompi";
import {
  cancelSubscription,
  reactivateCanceled,
  saveBillingProfile,
  startCheckout,
  subscribeWithCard,
  type CheckoutError,
} from "@/modules/subscription/subscription";
import { getActionContext, type ActionState } from "../action-context";

const FORBIDDEN: ActionState = {
  ok: false,
  message: "Solo el propietario de la escuela maneja la suscripción.",
};
// La suscripción siempre se puede pagar o cancelar, aunque la escuela esté en solo lectura.
const owner = (slug: string) => getActionContext(slug, canManageSubscription, { allowReadOnly: true });

const ERRORS: Record<CheckoutError | "card", string> = {
  not_configured:
    "Los pagos en línea de Podium aún no están disponibles. Escríbenos por WhatsApp para activar tu plan.",
  billing_profile: "Completa los datos de facturación antes de pagar.",
  invalid_plan: "Elige un plan válido.",
  card: "Wompi no aceptó la tarjeta. Revisa los datos o usa otro medio.",
};

const intervalSchema = z.enum(["MONTHLY", "ANNUAL"]);

export async function saveBillingProfileAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const m = await owner(slug);
  if (!m) return FORBIDDEN;
  const f = formReader(form);
  const result = await saveBillingProfile(db, m.ctx, {
    legalName: f.text("legalName"),
    documentType: f.text("documentType"),
    documentNumber: f.text("documentNumber"),
    address: f.text("address"),
    billingEmail: f.text("billingEmail"),
  });
  if (!result.ok) return { ok: false, message: "Revisa los campos marcados", errors: result.errors };
  refresh();
  return { ok: true, message: "Datos de facturación guardados" };
}

async function origin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** Pago con link en el checkout de Wompi de Podium (PSE, Nequi, tarjeta). Devuelve la URL a la que ir. */
export async function checkoutAction(
  slug: string,
  planCode: string,
  interval: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const m = await owner(slug);
  if (!m) return { ok: false, message: FORBIDDEN.message! };
  const parsed = intervalSchema.safeParse(interval);
  if (!parsed.success) return { ok: false, message: ERRORS.invalid_plan };
  const base = await origin();
  const result = await startCheckout(
    db,
    m.ctx,
    { planCode, interval: parsed.data },
    {
      provider: wompiProvider(),
      keys: podiumPaymentKeys(),
      returnUrl: (ref) => `${base}/${slug}/suscripcion?ref=${ref}`,
    },
    new Date(),
  );
  return result.ok ? { ok: true, url: result.url } : { ok: false, message: ERRORS[result.error] };
}

/** Tarjeta con cobro automático: el navegador tokeniza la tarjeta en Wompi y aquí se guarda y se cobra. */
export async function subscribeWithCardAction(
  slug: string,
  input: { cardToken: string; planCode: string; interval: string },
): Promise<ActionState> {
  const m = await owner(slug);
  if (!m) return FORBIDDEN;
  const interval = intervalSchema.safeParse(input.interval);
  if (!interval.success || !/^tok_[\w-]{4,120}$/.test(input.cardToken))
    return { ok: false, message: ERRORS.card };
  const result = await subscribeWithCard(
    db,
    m.ctx,
    { cardToken: input.cardToken, planCode: input.planCode, interval: interval.data },
    { cardApi: wompiCardApi(), keys: podiumPaymentKeys(), mailer: mailer() },
    new Date(),
  );
  if (!result.ok) return { ok: false, message: ERRORS[result.error] };
  refresh();
  if (result.result === "paid") return { ok: true, message: "¡Listo! Tu suscripción quedó activa." };
  if (result.result === "pending")
    return { ok: true, message: "El pago está en verificación. Te avisaremos por email." };
  return {
    ok: false,
    message: "El banco rechazó el cobro. La tarjeta quedó guardada; intenta con otra o paga con link.",
  };
}

export async function cancelSubscriptionAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const m = await owner(slug);
  if (!m) return FORBIDDEN;
  const f = formReader(form);
  const reason = [f.text("reason"), f.text("details")].filter(Boolean).join(" · ");
  if (!f.text("reason")) return { ok: false, errors: { reason: ["Cuéntanos el motivo"] } };
  const result = await cancelSubscription(db, m.ctx, reason, new Date());
  refresh();
  return {
    ok: true,
    message: result.immediate
      ? "La escuela quedó cancelada. Conservamos tus datos 90 días."
      : "Cancelada: la escuela sigue activa hasta el fin del periodo pagado.",
  };
}

export async function reactivateAction(slug: string): Promise<ActionState> {
  const m = await owner(slug);
  if (!m) return FORBIDDEN;
  await reactivateCanceled(db, m.ctx, new Date());
  refresh();
  return { ok: true };
}
