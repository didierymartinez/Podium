import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, ProviderKeys, ProviderTransaction } from "./provider";

const API = { sandbox: "https://sandbox.wompi.co/v1", production: "https://production.wompi.co/v1" } as const;
const CHECKOUT = "https://checkout.wompi.co/p/";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Prefijos esperados por ambiente: evita pegar llaves de producción en pruebas o al revés. */
export function keysLookValid(keys: ProviderKeys) {
  const env = keys.environment === "production" ? "prod" : "test";
  return (
    keys.publicKey.startsWith(`pub_${env}_`) &&
    keys.privateKey.startsWith(`prv_${env}_`) &&
    keys.eventsSecret.startsWith(`${env}_events_`) &&
    keys.integritySecret.startsWith(`${env}_integrity_`)
  );
}

/** Firma de integridad del checkout: SHA256(referencia + centavos + moneda + secreto). */
export function integritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
  secret: string,
) {
  return sha256(`${reference}${amountInCents}${currency}${secret}`);
}

function toTransaction(t: Record<string, unknown>): ProviderTransaction {
  return {
    id: String(t.id),
    reference: String(t.reference),
    status: String(t.status) as ProviderTransaction["status"],
    amountInCents: Number(t.amount_in_cents),
    createdAt: String(t.created_at ?? new Date().toISOString()),
  };
}

/** Lee un valor anidado "transaction.amount_in_cents" del evento. */
function pick(data: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined),
      data,
    );
}

export function wompiProvider(fetchImpl: typeof fetch = fetch): PaymentProvider {
  return {
    async verifyAccount(keys) {
      if (!keysLookValid(keys)) {
        return { ok: false, error: "Las llaves no corresponden al ambiente elegido (pruebas o producción)." };
      }
      try {
        const res = await fetchImpl(
          `${API[keys.environment]}/merchants/${encodeURIComponent(keys.publicKey)}`,
        );
        if (!res.ok) return { ok: false, error: "Wompi no reconoce la llave pública." };
        const body = (await res.json()) as { data?: { name?: string; legal_name?: string } };
        return { ok: true, merchantName: body.data?.legal_name || body.data?.name || "Comercio Wompi" };
      } catch {
        return { ok: false, error: "No pudimos conectar con Wompi. Intenta de nuevo." };
      }
    },

    checkoutUrl(keys, input) {
      const params = new URLSearchParams({
        "public-key": keys.publicKey,
        currency: "COP",
        "amount-in-cents": String(input.amountInCents),
        reference: input.reference,
        "signature:integrity": integritySignature(
          input.reference,
          input.amountInCents,
          "COP",
          keys.integritySecret,
        ),
        "redirect-url": input.redirectUrl,
      });
      if (input.email) params.set("customer-data:email", input.email);
      return `${CHECKOUT}?${params}`;
    },

    parseEvent(keys, body) {
      const event = body as {
        event?: string;
        data?: { transaction?: Record<string, unknown> };
        signature?: { properties?: string[]; checksum?: string };
        timestamp?: number;
      };
      if (event?.event !== "transaction.updated" || !event.data?.transaction || !event.signature?.checksum)
        return null;
      const props = event.signature.properties ?? [];
      const concatenated = props.map((p) => String(pick(event.data, p) ?? "")).join("");
      const expected = Buffer.from(sha256(`${concatenated}${event.timestamp}${keys.eventsSecret}`));
      const given = Buffer.from(String(event.signature.checksum).toLowerCase());
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      return toTransaction(event.data.transaction);
    },

    async findByReference(keys, reference) {
      const res = await fetchImpl(
        `${API[keys.environment]}/transactions?reference=${encodeURIComponent(reference)}`,
        {
          headers: { authorization: `Bearer ${keys.privateKey}` },
        },
      );
      if (!res.ok) throw new Error(`Wompi ${res.status}`);
      const body = (await res.json()) as { data?: Record<string, unknown>[] };
      return (body.data ?? []).map(toTransaction);
    },
  };
}

/** Evento firmado como lo envía Wompi (para pruebas). */
export function signedTestEvent(
  transaction: Record<string, unknown>,
  eventsSecret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const data = { transaction };
  const concatenated = properties.map((p) => String(pick(data, p))).join("");
  return {
    event: "transaction.updated",
    data,
    environment: "test",
    signature: { properties, checksum: sha256(`${concatenated}${timestamp}${eventsSecret}`) },
    timestamp,
    sent_at: new Date(timestamp * 1000).toISOString(),
  };
}
