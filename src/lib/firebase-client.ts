import { getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { publicEnv } from "./public-env";

/** Firebase Auth en el navegador (se inicializa una sola vez). */
export function firebaseAuth(): Auth {
  const app = getApps()[0] ?? initializeApp(publicEnv.firebase);
  const auth = getAuth(app);
  auth.languageCode = "es";
  return auth;
}

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/email-already-in-use": "Ya existe una cuenta con ese email. Ingresa en lugar de registrarte.",
  "auth/invalid-credential": "Email o contraseña incorrectos.",
  "auth/invalid-email": "El email no es válido.",
  "auth/weak-password": "La contraseña debe tener al menos 8 caracteres.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  "auth/popup-closed-by-user": "Se cerró la ventana de Google antes de terminar.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
};

export function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  return (code && FIREBASE_ERRORS[code]) ?? "No pudimos completar la operación. Inténtalo de nuevo.";
}
