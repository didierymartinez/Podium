import type { EmailMessage, Mailer } from "./types";

/** Desarrollo y pruebas: no envía; imprime en consola y guarda en memoria. */
export function consoleMailer(options: { quiet?: boolean } = {}): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      if (!options.quiet) console.info(`[correo] para ${message.to}: ${message.subject}`);
      return { ok: true, id: `console-${sent.length}` };
    },
  };
}
