import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, "base64").length === 32,
      "DATA_ENCRYPTION_KEY debe ser de 32 bytes en base64",
    ),
  NEXT_PUBLIC_AUTH_PROVIDER: z.enum(["firebase", "dev"]).default("firebase"),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  ALLOW_DEV_AUTH: z.enum(["true", "false"]).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/** Variables de entorno del servidor, validadas al primer uso. */
export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
