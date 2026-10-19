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
  "auth/popup-blocked": "El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio.",
  // Errores de configuración del proyecto de Firebase (los ve quien está montando la app).
  "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).",
  "auth/operation-not-allowed": "Este método de ingreso no está habilitado en Firebase (Authentication → Método de acceso).",
  "auth/configuration-not-found": "Firebase Authentication no está configurado en este proyecto.",
  "auth/invalid-api-key": "La llave de Firebase no es válida: revisa NEXT_PUBLIC_FIREBASE_API_KEY.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "La llave de Firebase no es válida: revisa NEXT_PUBLIC_FIREBASE_API_KEY.",
};

export function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code && FIREBASE_ERRORS[code]) return FIREBASE_ERRORS[code];
  // El código ayuda a soporte a encontrar la causa sin pedir capturas de la consola.
  return `No pudimos completar la operación. Inténtalo de nuevo.${code ? ` (${code})` : ""}`;
}
