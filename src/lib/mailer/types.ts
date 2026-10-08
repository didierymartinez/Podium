/** Correo saliente (regla de portabilidad #8): Resend hoy, cualquier proveedor SMTP/API mañana. */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
};

export interface Mailer {
  send(message: EmailMessage): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}
