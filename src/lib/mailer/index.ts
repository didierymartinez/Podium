import "server-only";
import { serverEnv } from "@/env";
import { consoleMailer } from "./console";
import { resendMailer } from "./resend";
import type { Mailer } from "./types";

export type { EmailMessage, Mailer } from "./types";

let cached: Mailer | undefined;

/** Resend si hay `RESEND_API_KEY`; si no, consola (desarrollo y E2E). */
export function mailer(): Mailer {
  if (cached) return cached;
  const env = serverEnv();
  cached =
    env.RESEND_API_KEY && env.EMAIL_FROM
      ? resendMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
      : consoleMailer();
  return cached;
}
