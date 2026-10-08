import "server-only";
import { serverEnv } from "@/env";
import { fcmNotifier, type ServiceAccount } from "./fcm";
import type { Notifier } from "./types";

export type { Notifier, PushMessage } from "./types";

let cached: Notifier | null | undefined;

/** FCM si hay cuenta de servicio configurada; si no, sin push (se usa el correo). */
export function notifier(): Notifier | null {
  if (cached !== undefined) return cached;
  const env = serverEnv();
  if (!env.FIREBASE_SERVICE_ACCOUNT) return (cached = null);
  try {
    const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
    cached = fcmNotifier(account, env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  } catch {
    cached = null;
  }
  return cached;
}
