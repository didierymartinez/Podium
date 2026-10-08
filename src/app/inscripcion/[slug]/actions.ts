"use server";

import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { todayIn } from "@/lib/dates";
import { hitRateLimit, parseLimit } from "@/modules/security/rate-limit";
import { verifyTurnstile } from "@/modules/security/turnstile";
import { signupSchema, submitSignup } from "@/modules/signup/public-signup";
import { deliverSoon } from "../../deliver";

export type SignupState = { ok?: boolean; message?: string; done?: { groupName: string; trialDate: string } };

const ERRORS = {
  closed: "La escuela no está recibiendo pre-inscripciones en este momento.",
  group_unavailable: "Ese grupo ya no tiene cupo. Elige otro.",
  date_unavailable: "Ese día ya no está disponible. Elige otra fecha.",
  duplicate: "Ya existe un alumno con esos datos en la escuela. Escríbeles directamente.",
  invalid: "Revisa los datos e intenta de nuevo.",
} as const;

/** Envío del formulario público (ADM-19): límite por IP y captcha si está configurado. */
export async function submitSignupAction(
  slug: string,
  input: unknown,
  turnstileToken: string | null,
): Promise<SignupState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const limit = await hitRateLimit(
    db,
    `signup:${ip ?? "sin-ip"}`,
    parseLimit(serverEnv().SIGNUP_RATE_LIMIT, { max: 10, windowSeconds: 3600 }),
  );
  if (!limit.allowed) return { ok: false, message: "Demasiados envíos. Intenta de nuevo más tarde." };
  const secret = serverEnv().TURNSTILE_SECRET_KEY;
  if (secret && !(await verifyTurnstile(turnstileToken ?? undefined, { secret, ip })))
    return { ok: false, message: "No pudimos verificar que eres una persona. Intenta de nuevo." };
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? ERRORS.invalid };
  const [row] = await db.execute<{ id: string | null; tz: string | null }>(
    sql`select school_id_by_slug(${slug}) as id`,
  );
  if (!row?.id) return { ok: false, message: ERRORS.closed };
  const tz = "America/Bogota";
  const result = await submitSignup(db, { id: row.id, slug }, parsed.data, { today: todayIn(tz), ip });
  if (!result.ok) return { ok: false, message: ERRORS[result.error] };
  deliverSoon(row.id);
  return { ok: true, done: { groupName: result.groupName, trialDate: result.trialDate } };
}
