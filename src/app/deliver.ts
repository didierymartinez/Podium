import "server-only";
import { after } from "next/server";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { mailer } from "@/lib/mailer";
import { notifier } from "@/lib/notifier";
import { whatsapp, whatsappTemplate } from "@/lib/whatsapp-cloud";
import { todayIn } from "@/lib/dates";
import { awardBadges } from "@/modules/badges/badges";
import { deliverPending } from "@/modules/notifications/delivery";

export const appUrl = () => serverEnv().NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Canales de entrega configurados en este entorno (push, WhatsApp y correo). */
export function deliveryChannels() {
  const sender = whatsapp();
  return {
    mailer: mailer(),
    notifier: notifier(),
    appUrl: appUrl(),
    whatsapp: sender ? { sender, template: whatsappTemplate() } : null,
  };
}

/** Entrega push/correo de la bandeja de la escuela después de responder (no bloquea al usuario). */
export function deliverSoon(schoolId: string) {
  after(async () => {
    await deliverPending(db, deliveryChannels(), schoolId).catch((err) => console.error("[entrega]", err));
  });
}

/**
 * Revisa las insignias de estos alumnos después de responder (§10) y entrega los avisos. La tarea
 * diaria también las otorga, así que un fallo aquí no pierde nada.
 */
export function awardBadgesSoon(
  school: { id: string; slug: string; timezone: string },
  athleteIds: string[],
) {
  if (athleteIds.length === 0) return;
  after(async () => {
    try {
      const awarded = await awardBadges(db, school, todayIn(school.timezone), athleteIds);
      if (awarded > 0) await deliverPending(db, deliveryChannels(), school.id);
    } catch (err) {
      console.error("[insignias]", err);
    }
  });
}
