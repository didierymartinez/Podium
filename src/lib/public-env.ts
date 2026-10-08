/** Variables públicas: Next las incrusta en el cliente solo si se leen de forma literal. */
export const publicEnv = {
  authProvider: (process.env.NEXT_PUBLIC_AUTH_PROVIDER === "dev" ? "dev" : "firebase") as "firebase" | "dev",
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  },
  /** Clave VAPID pública de Firebase Cloud Messaging; sin ella no se ofrecen notificaciones push. */
  vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "",
  /** Llave pública de Cloudflare Turnstile; sin ella no se pide captcha (desarrollo y pruebas). */
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
};
