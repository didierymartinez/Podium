import "server-only";
import { serverEnv } from "@/env";
import { cloudSender } from "./cloud";
import type { WhatsAppSender } from "./types";

export type { WhatsAppSender } from "./types";

/** Plantilla de utilidad genérica (§4.4): {{1}} escuela, {{2}} resumen, {{3}} enlace. */
export function whatsappTemplate() {
  const env = serverEnv();
  return { name: env.WHATSAPP_TEMPLATE ?? "aviso_podium", language: env.WHATSAPP_TEMPLATE_LANG ?? "es" };
}

let cached: WhatsAppSender | null | undefined;

/** Cloud API si hay credenciales; si no, la cascada sigue con push y correo. */
export function whatsapp(): WhatsAppSender | null {
  if (cached !== undefined) return cached;
  const env = serverEnv();
  cached =
    env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
      ? cloudSender({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID })
      : null;
  return cached;
}
