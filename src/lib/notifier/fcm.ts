import { importPKCS8, SignJWT } from "jose";
import type { Notifier, PushMessage, PushResult } from "./types";

export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/**
 * FCM HTTP v1 con una cuenta de servicio. El token OAuth se firma con `jose` (sin firebase-admin,
 * regla de portabilidad #11) y se reutiliza mientras no venza.
 */
export function fcmNotifier(
  account: ServiceAccount,
  appUrl: string,
  fetchImpl: typeof fetch = fetch,
): Notifier {
  let cached: { token: string; expiresAt: number } | null = null;
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";

  async function accessToken() {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const key = await importPKCS8(account.private_key, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(account.client_email)
      .setSubject(account.client_email)
      .setAudience(tokenUri)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const res = await fetchImpl(tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) throw new Error(`OAuth ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return cached.token;
  }

  return {
    async send(token: string, message: PushMessage): Promise<PushResult> {
      try {
        const link = new URL(message.href, appUrl).toString();
        const res = await fetchImpl(
          `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
            body: JSON.stringify({
              message: {
                token,
                data: { title: message.title, body: message.body, href: message.href },
                webpush: {
                  notification: { title: message.title, body: message.body, icon: "/icon-192.png" },
                  fcm_options: { link },
                },
              },
            }),
          },
        );
        if (res.ok) return "sent";
        const text = await res.text();
        // Token vencido o desinstalado: se borra.
        if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) return "invalid_token";
        return "error";
      } catch {
        return "error";
      }
    },
  };
}
