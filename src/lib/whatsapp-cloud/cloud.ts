import type { TemplateMessage, WhatsAppResult, WhatsAppSender } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

type GraphResponse = { messages?: { id: string }[]; error?: { message?: string; code?: number } };

/** Meta WhatsApp Cloud API (número de Podium). */
export function cloudSender(
  config: { token: string; phoneNumberId: string },
  fetchImpl: typeof fetch = fetch,
): WhatsAppSender {
  async function post(payload: Record<string, unknown>): Promise<WhatsAppResult> {
    try {
      const res = await fetchImpl(`${GRAPH}/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json().catch(() => ({}))) as GraphResponse;
      const id = data.messages?.[0]?.id;
      if (res.ok && id) return { ok: true, id };
      // 131026: el número no tiene WhatsApp o no puede recibir el mensaje.
      return {
        ok: false,
        error: data.error?.message ?? `HTTP ${res.status}`,
        invalidNumber: data.error?.code === 131026,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return {
    sendTemplate: (m: TemplateMessage) =>
      post({
        to: m.to,
        type: "template",
        template: {
          name: m.template,
          language: { code: m.language },
          components: [
            {
              type: "body",
              parameters: m.params.map((text) => ({ type: "text", text })),
            },
          ],
        },
      }),
    sendText: (to, body) => post({ to, type: "text", text: { body } }),
  };
}

/** Parámetro de plantilla válido: Meta no admite saltos de línea, tabs ni más de 4 espacios seguidos. */
export function templateParam(value: string, max = 300) {
  const clean = value
    .replace(/[\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** "+573001234567" → "573001234567"; null si no es un celular colombiano. */
export function waNumber(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.length === 12 && digits.startsWith("573")) return digits;
  return null;
}

/** Verifica que el token tenga acceso al número y devuelve el número visible (+57 300…). */
export async function verifyPhoneNumber(
  config: { token: string; phoneNumberId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; displayPhone: string } | { ok: false; error: string }> {
  try {
    const res = await fetchImpl(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}?fields=display_phone_number,verified_name`,
      { headers: { authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(10_000) },
    );
    const data = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      error?: { message?: string };
    };
    if (!res.ok || !data.display_phone_number)
      return { ok: false, error: data.error?.message ?? `Meta respondió ${res.status}` };
    return { ok: true, displayPhone: data.display_phone_number };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
