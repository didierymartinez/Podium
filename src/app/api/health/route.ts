import { sql } from "drizzle-orm";
import { ZodError } from "zod";
import { serverEnv } from "@/env";

/**
 * Chequeo de salud para la puesta en producción y el monitoreo (#18). Responde 200 si la configuración es
 * válida y la base responde con las tablas creadas; 503 si no. Solo informa nombres de variables, nunca valores.
 */
export async function GET() {
  const body: {
    ok: boolean;
    config: { ok: boolean; invalid?: string[] };
    auth?: string;
    database?: { ok: boolean; migrated?: boolean; error?: string };
  } = { ok: false, config: { ok: false } };

  try {
    const env = serverEnv();
    body.config = { ok: true };
    body.auth =
      env.NEXT_PUBLIC_AUTH_PROVIDER === "firebase"
        ? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
          ? "firebase"
          : "firebase sin NEXT_PUBLIC_FIREBASE_PROJECT_ID"
        : env.NEXT_PUBLIC_AUTH_PROVIDER;
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    body.config = { ok: false, invalid: [...new Set(error.issues.map((i) => i.path.join(".")))] };
    return Response.json(body, { status: 503, headers: { "cache-control": "no-store" } });
  }

  try {
    const { db } = await import("@/db/client");
    const rows = await Promise.race([
      db.execute<{ migrated: boolean }>(sql`select to_regclass('public.schools') is not null as migrated`),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    const migrated = Boolean([...rows][0]?.migrated);
    body.database = { ok: migrated, migrated };
  } catch (error) {
    // Solo el tipo de error (código de Postgres o mensaje corto); nunca la cadena de conexión.
    // Drizzle envuelve el error del driver en `cause` («Failed query: …»).
    const cause = ((error as { cause?: unknown }).cause ?? error) as { code?: string; message?: string };
    body.database = { ok: false, error: cause.code ?? String(cause.message).slice(0, 80) };
  }

  body.ok = body.config.ok && Boolean(body.database?.ok);
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
