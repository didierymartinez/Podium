/** Variables públicas: Next las incrusta en el cliente solo si se leen de forma literal. */
export const publicEnv = {
  authProvider: (process.env.NEXT_PUBLIC_AUTH_PROVIDER === "dev" ? "dev" : "firebase") as "firebase" | "dev",
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  },
};
