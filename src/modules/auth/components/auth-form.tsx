"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { firebaseAuth, firebaseErrorMessage } from "@/lib/firebase-client";
import { publicEnv } from "@/lib/public-env";
import { postSession, type SessionRequest } from "./post-session";

type Mode = "signup" | "login";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isDev = publicEnv.authProvider === "dev";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  async function finish(request: SessionRequest) {
    const result = await postSession(request);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(result.redirectTo);
    router.refresh();
  }

  async function run(task: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await task();
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim() || undefined;
    const phone = String(form.get("phone") ?? "").trim() || undefined;

    if (mode === "signup" && !acceptTerms) {
      setError("Debes aceptar los términos y la política de tratamiento de datos.");
      return;
    }

    void run(async () => {
      if (isDev) {
        await finish({ provider: "dev", email, name, phone, acceptTerms });
        return;
      }
      const auth = firebaseAuth();
      const {
        createUserWithEmailAndPassword,
        sendEmailVerification,
        signInWithEmailAndPassword,
        updateProfile,
      } = await import("firebase/auth");
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
        await sendEmailVerification(cred.user, { url: `${window.location.origin}/verificar-email` });
        await finish({
          provider: "firebase",
          idToken: await cred.user.getIdToken(),
          name,
          phone,
          acceptTerms,
        });
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await finish({ provider: "firebase", idToken: await cred.user.getIdToken() });
      }
    });
  }

  function onGoogle() {
    if (mode === "signup" && !acceptTerms) {
      setError("Debes aceptar los términos y la política de tratamiento de datos.");
      return;
    }
    void run(async () => {
      const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
      const cred = await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
      await finish({ provider: "firebase", idToken: await cred.user.getIdToken(), acceptTerms });
    });
  }

  return (
    <div className="space-y-5">
      {isDev && <Alert tone="info">Modo desarrollo: ingresas solo con el email, sin contraseña.</Alert>}

      {!isDev && (
        <>
          <Button type="button" variant="secondary" className="w-full" onClick={onGoogle} disabled={pending}>
            <GoogleIcon /> Continuar con Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-ink-faint">
            <span className="h-px flex-1 bg-line" /> o con tu email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "signup" && (
          <Field label="Nombre completo">
            <Input name="name" autoComplete="name" required maxLength={80} />
          </Field>
        )}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        {mode === "signup" && (
          <Field label="Celular" hint="Para avisos por WhatsApp más adelante. Ej.: 300 123 4567">
            <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" pattern="[0-9 +()-]{10,20}" />
          </Field>
        )}
        {!isDev && (
          <Field label="Contraseña" hint={mode === "signup" ? "Mínimo 8 caracteres" : undefined}>
            <Input
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </Field>
        )}

        {mode === "signup" && (
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-brand"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
            />
            <span>
              Acepto los{" "}
              <Link href="/terminos" className="font-medium text-brand underline">
                términos del servicio
              </Link>{" "}
              y autorizo el tratamiento de mis datos según la{" "}
              <Link href="/privacidad" className="font-medium text-brand underline">
                política de privacidad
              </Link>
              .
            </span>
          </label>
        )}

        {error && <Alert>{error}</Alert>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Un momento…" : mode === "signup" ? "Crear cuenta" : "Ingresar"}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-soft">
        {mode === "signup" ? (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/ingresar" className="font-semibold text-brand">
              Ingresa
            </Link>
          </>
        ) : (
          <>
            ¿Primera vez?{" "}
            <Link href="/registro" className="font-semibold text-brand">
              Crea tu cuenta
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z"
      />
    </svg>
  );
}
