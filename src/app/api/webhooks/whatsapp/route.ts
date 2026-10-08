import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { whatsapp } from "@/lib/whatsapp-cloud";
import { handleWhatsAppWebhook, validSignature } from "@/modules/notifications/whatsapp-webhook";

/** Verificación del webhook en Meta (`hub.challenge`). */
export function GET(request: NextRequest) {
  const expected = serverEnv().WHATSAPP_VERIFY_TOKEN;
  const params = request.nextUrl.searchParams;
  const token = Buffer.from(params.get("hub.verify_token") ?? "");
  if (
    !expected ||
    params.get("hub.mode") !== "subscribe" ||
    token.length !== Buffer.byteLength(expected) ||
    !timingSafeEqual(token, Buffer.from(expected))
  )
    return new Response(null, { status: 403 });
  return new Response(params.get("hub.challenge") ?? "", { headers: { "content-type": "text/plain" } });
}

/** Estados de entrega, baja con "SALIR" y respuesta automática (firmado con el secreto de la app). */
export async function POST(request: NextRequest) {
  const secret = serverEnv().WHATSAPP_APP_SECRET;
  if (!secret) return new Response("WhatsApp no está configurado", { status: 503 });
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), secret))
    return new Response(null, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const result = await handleWhatsAppWebhook(db, payload, whatsapp());
  return Response.json({ ok: true, ...result });
}
