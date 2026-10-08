import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Verifica un ID token de Firebase Authentication con `jose` (sin firebase-admin),
 * para que el código funcione en Node, Vercel, Cloud Run o Cloudflare Workers (regla #11).
 */
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export type VerifiedIdentity = {
  firebaseUid: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  /** Inició sesión con segundo factor (Identity Platform). */
  secondFactor: boolean;
};

export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<VerifiedIdentity> {
  const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
  });
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Token sin sujeto");
  if (typeof payload.email !== "string") throw new Error("La cuenta no tiene email");
  return {
    firebaseUid: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : null,
    secondFactor: Boolean(
      (payload.firebase as { sign_in_second_factor?: string } | undefined)?.sign_in_second_factor,
    ),
  };
}
