import type { Mailer } from "./types";

/** Resend por API HTTP (sin SDK): https://resend.com/docs/api-reference/emails/send-email */
export function resendMailer(
  config: { apiKey: string; from: string },
  fetchImpl: typeof fetch = fetch,
): Mailer {
  return {
    async send(message) {
      try {
        const res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
        return res.ok && body.id
          ? { ok: true, id: body.id }
          : { ok: false, error: body.message ?? `HTTP ${res.status}` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Error de red" };
      }
    },
  };
}
