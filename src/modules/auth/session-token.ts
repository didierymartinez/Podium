import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "podium_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 días

const key = (secret: string) => new TextEncoder().encode(secret);

/** Sesión propia de Podium (independiente del proveedor de identidad). */
export async function signSessionToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
