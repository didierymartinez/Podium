import { serverEnv } from "@/env";
import type { ProviderKeys, ProviderTransaction } from "@/modules/payments/provider";
import { integritySignature } from "@/modules/payments/wompi";

/**
 * Cuenta Wompi de Podium (no la de las escuelas) para cobrar la suscripción (#21).
 * Sin las cuatro llaves la suscripción no se puede pagar en línea (se activa desde la consola).
 */
export function podiumPaymentKeys(): ProviderKeys | null {
  const env = serverEnv();
  if (
    !env.PODIUM_WOMPI_PUBLIC_KEY ||
    !env.PODIUM_WOMPI_PRIVATE_KEY ||
    !env.PODIUM_WOMPI_EVENTS_SECRET ||
    !env.PODIUM_WOMPI_INTEGRITY_SECRET
  )
    return null;
  return {
    environment: env.PODIUM_WOMPI_PUBLIC_KEY.startsWith("pub_prod_") ? "production" : "sandbox",
    publicKey: env.PODIUM_WOMPI_PUBLIC_KEY,
    privateKey: env.PODIUM_WOMPI_PRIVATE_KEY,
    eventsSecret: env.PODIUM_WOMPI_EVENTS_SECRET,
    integritySecret: env.PODIUM_WOMPI_INTEGRITY_SECRET,
  };
}

const API = { sandbox: "https://sandbox.wompi.co/v1", production: "https://production.wompi.co/v1" } as const;
export const wompiApiBase = (keys: Pick<ProviderKeys, "environment">) => API[keys.environment];

/** Tarjeta tokenizada guardada como fuente de pago para cobros automáticos (API de Wompi). */
export type CardApi = {
  createPaymentSource(
    keys: ProviderKeys,
    input: { cardToken: string; email: string },
  ): Promise<{ id: string; label: string }>;
  charge(
    keys: ProviderKeys,
    input: { paymentSourceId: string; reference: string; amountInCents: number; email: string },
  ): Promise<ProviderTransaction>;
};

export function wompiCardApi(fetchImpl: typeof fetch = fetch): CardApi {
  async function call(url: string, init: RequestInit) {
    const res = await fetchImpl(url, init);
    const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown> };
    if (!res.ok || !body.data) throw new Error(`Wompi ${res.status}`);
    return body.data;
  }
  return {
    async createPaymentSource(keys, input) {
      // El token de aceptación de términos de Wompi es obligatorio para crear la fuente de pago.
      const merchant = await call(
        `${wompiApiBase(keys)}/merchants/${encodeURIComponent(keys.publicKey)}`,
        {},
      );
      const acceptance = (merchant.presigned_acceptance as { acceptance_token?: string } | undefined)
        ?.acceptance_token;
      if (!acceptance) throw new Error("Wompi sin token de aceptación");
      const source = await call(`${wompiApiBase(keys)}/payment_sources`, {
        method: "POST",
        headers: { authorization: `Bearer ${keys.privateKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          type: "CARD",
          token: input.cardToken,
          customer_email: input.email,
          acceptance_token: acceptance,
        }),
      });
      const info = (source.public_data ?? {}) as { type?: string; brand?: string; last_four?: string };
      return {
        id: String(source.id),
        label: [info.brand ?? "Tarjeta", info.last_four ? `•••• ${info.last_four}` : ""].join(" ").trim(),
      };
    },
    async charge(keys, input) {
      const t = await call(`${wompiApiBase(keys)}/transactions`, {
        method: "POST",
        headers: { authorization: `Bearer ${keys.privateKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          amount_in_cents: input.amountInCents,
          currency: "COP",
          customer_email: input.email,
          reference: input.reference,
          payment_source_id: Number(input.paymentSourceId),
          payment_method: { installments: 1 },
          signature: integritySignature(input.reference, input.amountInCents, "COP", keys.integritySecret),
        }),
      });
      return {
        id: String(t.id),
        reference: String(t.reference),
        status: String(t.status) as ProviderTransaction["status"],
        amountInCents: Number(t.amount_in_cents),
        createdAt: String(t.created_at ?? new Date().toISOString()),
      };
    },
  };
}
