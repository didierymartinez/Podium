import "server-only";
import { after } from "next/server";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { mailer } from "@/lib/mailer";
import { notifier } from "@/lib/notifier";
import { deliverPending } from "@/modules/notifications/delivery";

export const appUrl = () => serverEnv().NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Entrega push/correo de la bandeja de la escuela después de responder (no bloquea al usuario). */
export function deliverSoon(schoolId: string) {
  after(async () => {
    await deliverPending(db, { mailer: mailer(), notifier: notifier(), appUrl: appUrl() }, schoolId).catch(
      (err) => console.error("[entrega]", err),
    );
  });
}
