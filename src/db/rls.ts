import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type TenantContext = {
  schoolId?: string | null;
  userId?: string | null;
};

/**
 * Ejecuta `fn` en una transacción con el contexto de RLS (`app.school_id`, `app.user_id`).
 * Toda lectura/escritura de tablas de escuela debe pasar por aquí.
 */
export function runInTenant<T>(
  database: Database,
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.school_id', ${ctx.schoolId ?? ""}, true),
                 set_config('app.user_id', ${ctx.userId ?? ""}, true)`,
    );
    return fn(tx);
  });
}

/** Código de error de Postgres, venga directo de postgres.js o envuelto por Drizzle. */
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = typeof e?.code === "string" ? e.code : e?.cause?.code;
  return typeof code === "string" ? code : undefined;
}
