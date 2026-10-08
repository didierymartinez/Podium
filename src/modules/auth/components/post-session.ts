export type SessionRequest =
  | { provider: "firebase"; idToken: string; name?: string; phone?: string; acceptTerms?: boolean }
  | { provider: "dev"; email: string; name?: string; phone?: string; acceptTerms?: boolean };

export type SessionResponse =
  { ok: true; redirectTo: string } | { ok: false; error: string; message: string };

/** Envía la identidad al servidor para crear la sesión de Podium. */
export async function postSession(body: SessionRequest): Promise<SessionResponse> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "unknown", message: data.message ?? "Error inesperado" };
  }
  return { ok: true, redirectTo: data.redirectTo };
}
