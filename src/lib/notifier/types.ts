/** Notificaciones push (regla de portabilidad #8): FCM hoy; Web Push estándar (VAPID) si se migra. */
export type PushMessage = { title: string; body: string; href: string };
export type PushResult = "sent" | "invalid_token" | "error";

export interface Notifier {
  send(token: string, message: PushMessage): Promise<PushResult>;
}
