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
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  /** JSON de la cuenta de servicio de Firebase (FCM HTTP v1). */
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  /** Secreto de Cloudflare Turnstile; si falta, no se exige captcha. */
  TURNSTILE_SECRET_KEY: z.string().optional(),
  /** Intentos de ingreso/registro por IP: "máximo/segundos" (por defecto 20 cada 10 minutos). */
  AUTH_RATE_LIMIT: z.string().optional(),
  /** Emails (separados por coma) que son super admin de Podium (#17). */
  PLATFORM_ADMIN_EMAILS: z.string().optional(),
  /** Cuenta Wompi de Podium para cobrar la suscripción de las escuelas (#21). */
  PODIUM_WOMPI_PUBLIC_KEY: z.string().optional(),
  PODIUM_WOMPI_PRIVATE_KEY: z.string().optional(),
  PODIUM_WOMPI_EVENTS_SECRET: z.string().optional(),
  PODIUM_WOMPI_INTEGRITY_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/** Variables de entorno del servidor, validadas al primer uso. */
export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
