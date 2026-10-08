import "server-only";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { LEGAL_VERSION } from "./users";
import { serverEnv } from "@/env";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "./session-token";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  /** La sesión se inició con segundo factor (requisito de la consola de Podium). */
  mfa: boolean;
  /** Aceptó la versión vigente de términos y política de datos (#22). */
  legalCurrent: boolean;
};

export async function startSession(userId: string, opts: { mfa?: boolean } = {}) {
  const token = await signSessionToken(userId, serverEnv().SESSION_SECRET, opts);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Usuario de la sesión actual (una sola consulta por request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token, serverEnv().SESSION_SECRET);
  if (!claims) return null;
  const [row] = await db
    .select({
      user: users,
      legalVersion: sql<string | null>`(select max(version) from legal_acceptances l
        where l.user_id = "users"."id" and l.document = 'TERMS' and l.school_id is null and l.revoked_at is null)`,
    })
    .from(users)
    .where(eq(users.id, claims.userId));
  if (!row) return null;
  const user = row.user;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerifiedAt !== null,
    isPlatformAdmin: user.isPlatformAdmin,
    mfa: claims.mfa,
    legalCurrent: row.legalVersion !== null && row.legalVersion >= LEGAL_VERSION,
  };
});

/**
 * Consola de Podium (#17): solo super admins y, con Firebase, solo si la sesión se inició con segundo factor
 * (Identity Platform). En modo dev no hay 2FA.
 */
export const hasConsoleAccess = (user: CurrentUser) =>
  user.isPlatformAdmin && (user.mfa || serverEnv().NEXT_PUBLIC_AUTH_PROVIDER === "dev");

export async function requirePlatformAdmin(): Promise<CurrentUser> {
  const user = await requireVerifiedUser();
  if (!user.isPlatformAdmin) redirect("/escuelas");
  if (!hasConsoleAccess(user)) redirect("/ingresar?mfa=1&next=/admin");
  return user;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  return user;
}

export async function requireVerifiedUser(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.emailVerified) redirect("/verificar-email");
  // Al publicar una nueva versión de los textos legales se pide aceptarla otra vez.
  if (!user.legalCurrent) redirect("/aceptar-terminos");
  return user;
}
