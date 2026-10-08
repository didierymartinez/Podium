"use client";

import { useState } from "react";
import type { TotpSecret } from "firebase/auth";
import { Alert, Button, Field, Input } from "@/components/ui";
import { firebaseAuth, firebaseErrorMessage } from "@/lib/firebase-client";
import { publicEnv } from "@/lib/public-env";

export function TotpEnrollment({ email }: { email: string }) {
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (publicEnv.authProvider === "dev")
    return <Alert tone="info">En modo desarrollo no hay segundo factor.</Alert>;

  async function start() {
    setPending(true);
    setMessage(null);
    try {
      const { multiFactor, TotpMultiFactorGenerator } = await import("firebase/auth");
      const user = firebaseAuth().currentUser;
      if (!user) throw Object.assign(new Error(), { code: "auth/requires-recent-login" });
      const session = await multiFactor(user).getSession();
      setSecret(await TotpMultiFactorGenerator.generateSecret(session));
    } catch (err) {
      setMessage({ ok: false, text: reauthMessage(err) });
    } finally {
      setPending(false);
    }
  }

  async function enroll(code: string) {
    if (!secret) return;
    setPending(true);
    try {
      const { multiFactor, TotpMultiFactorGenerator } = await import("firebase/auth");
      const user = firebaseAuth().currentUser!;
      await multiFactor(user).enroll(
        TotpMultiFactorGenerator.assertionForEnrollment(secret, code),
        "Autenticador",
      );
      setMessage({
        ok: true,
        text: "Listo. Cierra sesión e ingresa de nuevo con tu código para abrir la consola.",
      });
      setSecret(null);
    } catch (err) {
      setMessage({ ok: false, text: firebaseErrorMessage(err) });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {message && <Alert tone={message.ok ? "info" : "danger"}>{message.text}</Alert>}
      {!secret ? (
        <Button onClick={start} disabled={pending}>
          {pending ? "Preparando…" : "Activar segundo factor"}
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void enroll(String(new FormData(e.currentTarget).get("code") ?? ""));
          }}
        >
          <p className="text-sm">
            Clave para tu app: <code className="break-all font-mono font-semibold">{secret.secretKey}</code>
          </p>
          <p className="break-all text-xs text-ink-soft">{secret.generateQrCodeUrl(email, "Podium")}</p>
          <Field label="Código de 6 dígitos">
            <Input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required />
          </Field>
          <Button type="submit" disabled={pending}>
            Verificar y activar
          </Button>
        </form>
      )}
    </div>
  );
}

function reauthMessage(err: unknown) {
  const code = (err as { code?: string })?.code;
  return code === "auth/requires-recent-login"
    ? "Por seguridad, cierra sesión e ingresa de nuevo antes de activar el segundo factor."
    : firebaseErrorMessage(err);
}
