"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import { firebaseAuth, firebaseErrorMessage } from "@/lib/firebase-client";
import { postSession } from "./post-session";

export function VerifyEmail({ email }: { email: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function withUser(
    task: (user: NonNullable<ReturnType<typeof firebaseAuth>["currentUser"]>) => Promise<void>,
  ) {
    setPending(true);
    setMessage(null);
    try {
      const auth = firebaseAuth();
      await auth.authStateReady();
      if (!auth.currentUser) {
        setMessage({ tone: "danger", text: "Tu sesión expiró en este dispositivo. Ingresa de nuevo." });
        return;
      }
      await task(auth.currentUser);
    } catch (err) {
      setMessage({ tone: "danger", text: firebaseErrorMessage(err) });
    } finally {
      setPending(false);
    }
  }

  const resend = () =>
    withUser(async (user) => {
      const { sendEmailVerification } = await import("firebase/auth");
      await sendEmailVerification(user, { url: `${window.location.origin}/verificar-email` });
      setMessage({ tone: "info", text: "Te enviamos un nuevo correo de verificación." });
    });

  const check = () =>
    withUser(async (user) => {
      await user.reload();
      if (!user.emailVerified) {
        setMessage({
          tone: "danger",
          text: "Aún no vemos tu email verificado. Revisa tu bandeja y la carpeta de spam.",
        });
        return;
      }
      const result = await postSession({ provider: "firebase", idToken: await user.getIdToken(true) });
      if (!result.ok) {
        setMessage({ tone: "danger", text: result.message });
        return;
      }
      router.push(result.redirectTo);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Enviamos un enlace a <strong className="text-ink">{email}</strong>. Ábrelo para confirmar tu email y
        luego vuelve aquí.
      </p>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button className="w-full" onClick={check} disabled={pending}>
        Ya verifiqué mi email
      </Button>
      <Button variant="secondary" className="w-full" onClick={resend} disabled={pending}>
        Reenviar correo
      </Button>
      <p className="text-center text-sm">
        <Link href="/ingresar" className="text-brand">
          Ingresar con otra cuenta
        </Link>
      </p>
    </div>
  );
}
