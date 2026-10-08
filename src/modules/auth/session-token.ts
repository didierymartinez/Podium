import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "podium_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 días

const key = (secret: string) => new TextEncoder().encode(secret);

export type SessionClaims = { userId: string; /** Inició sesión con segundo factor (2FA). */ mfa: boolean };

/** Sesión propia de Podium (independiente del proveedor de identidad). */
export async function signSessionToken(
  userId: string,
  secret: string,
  opts: { mfa?: boolean } = {},
): Promise<string> {
  return new SignJWT({ mfa: opts.mfa === true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || payload.kind === "support") return null;
    return { userId: payload.sub, mfa: payload.mfa === true };
  } catch {
    return null;
  }
}

export const SUPPORT_COOKIE = "podium_support";
export const SUPPORT_MAX_AGE_SECONDS = 30 * 60;

/** "Entrar como" (soporte de Podium, #17): acceso de solo lectura a una escuela, con motivo y vencimiento. */
export async function signSupportToken(
  input: { adminUserId: string; schoolId: string; reason: string },
  secret: string,
): Promise<string> {
  return new SignJWT({ school: input.schoolId, reason: input.reason, kind: "support" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.adminUserId)
    .setIssuedAt()
    .setExpirationTime(`${SUPPORT_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySupportToken(token: string, secret: string) {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    if (payload.kind !== "support" || typeof payload.sub !== "string" || typeof payload.school !== "string")
      return null;
    return {
      adminUserId: payload.sub,
      schoolId: payload.school,
      reason: String(payload.reason ?? ""),
      expiresAt: new Date((payload.exp ?? 0) * 1000),
    };
  } catch {
    return null;
  }
}
