import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "@/db/rls";
import type { WhatsAppSender } from "@/lib/whatsapp-cloud/types";

/** Webhook de WhatsApp Cloud API (#64): estados de entrega (COM-15), baja "SALIR" (COM-31) y respuestas. */

const OPT_OUT = new Set(["SALIR", "STOP", "BAJA", "CANCELAR"]);
const STATUSES = new Set(["sent", "delivered", "read", "failed"]);

export const OPT_OUT_REPLY =
  "Listo: no te enviaremos más mensajes por WhatsApp. Seguirás recibiendo los avisos en la app y por correo. " +
  "Para volver a activarlos entra a Mis datos en Podium.";
export const AUTO_REPLY =
  "Hola 👋 Este número solo envía notificaciones de las escuelas que usan Podium y no recibe mensajes. " +
  "Para hablar con tu escuela escríbele directamente o entra a la app. Responde SALIR si no quieres recibir más mensajes por aquí.";

/** Firma `X-Hub-Signature-256` de Meta: HMAC-SHA256 del cuerpo con el secreto de la app. */
export function validSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Payload = {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id?: string; status?: string; errors?: { title?: string; message?: string }[] }[];
        messages?: { from?: string; type?: string; text?: { body?: string } }[];
      };
    }[];
  }[];
};

export async function handleWhatsAppWebhook(
  database: Database,
  payload: unknown,
  sender: WhatsAppSender | null,
) {
  const result = { statuses: 0, optOuts: 0, replies: 0 };
  for (const entry of (payload as Payload)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        if (!s.id || !s.status || !STATUSES.has(s.status)) continue;
        const error = s.errors?.[0] ? (s.errors[0].message ?? s.errors[0].title ?? null) : null;
        const [row] = await database.execute<{ n: number }>(
          sql`select whatsapp_status(${s.id}, ${s.status}, ${error?.slice(0, 300) ?? null}) as n`,
        );
        result.statuses += Number(row?.n ?? 0);
      }
      for (const m of change.value?.messages ?? []) {
        if (!m.from || !/^\d{8,15}$/.test(m.from)) continue;
        const text = (m.type === "text" ? (m.text?.body ?? "") : "").trim().toUpperCase();
        if (OPT_OUT.has(text)) {
          const [row] = await database.execute<{ n: number }>(
            sql`select whatsapp_opt_out(${`+${m.from}`}) as n`,
          );
          result.optOuts += Number(row?.n ?? 0);
          if (sender && (await sender.sendText(m.from, OPT_OUT_REPLY)).ok) result.replies++;
        } else if (sender && (await sender.sendText(m.from, AUTO_REPLY)).ok) result.replies++;
      }
    }
  }
  return result;
}
