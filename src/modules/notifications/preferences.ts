import { z } from "zod";

/** Temas de avisos que cada persona puede apagar por canal (ADM-64). */
export const NOTIFICATION_TOPICS = {
  billing: "Cobros y pagos",
  attendance: "Clases y asistencia",
  notices: "Avisos de la escuela",
} as const;
export type NotificationTopic = keyof typeof NOTIFICATION_TOPICS;
export type Channel = "push" | "whatsapp" | "email";

const channelPrefs = z.object({
  push: z.boolean().default(true),
  whatsapp: z.boolean().default(true),
  email: z.boolean().default(true),
});
const ALL_ON = { push: true, whatsapp: true, email: true };
export const preferencesSchema = z.object({
  billing: channelPrefs.default(ALL_ON),
  attendance: channelPrefs.default(ALL_ON),
  notices: channelPrefs.default(ALL_ON),
});
export type NotificationPreferences = z.infer<typeof preferencesSchema>;

export function readPreferences(raw: unknown): NotificationPreferences {
  const parsed = preferencesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : preferencesSchema.parse({});
}

/** Tema de una notificación según su tipo; los avisos internos y de cuenta siempre se envían. */
export function topicOf(kind: string): NotificationTopic | null {
  if (kind.startsWith("invoice.") || kind.startsWith("payment.") || kind.startsWith("billing."))
    return "billing";
  if (kind.startsWith("session.") || kind.startsWith("attendance.") || kind.startsWith("enrollment."))
    return "attendance";
  if (kind.startsWith("announcement")) return "notices";
  return null;
}

export function allows(prefs: NotificationPreferences, kind: string, channel: Channel) {
  const topic = topicOf(kind);
  return topic ? prefs[topic][channel] : true;
}
