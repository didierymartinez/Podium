import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/env";
import type { Database } from "./rls";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { podiumDb?: Database };

function createDb(): Database {
  // `prepare: false` mantiene compatibilidad con poolers en modo transacción (Neon, PgBouncer).
  const client = postgres(serverEnv().DATABASE_URL, { prepare: false, max: 10 });
  return drizzle(client, { schema });
}

/**
 * Conexión de la aplicación (rol con RLS). Se crea al primer uso para que `next build`
 * no necesite variables de entorno de base de datos.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    globalForDb.podiumDb ??= createDb();
    return Reflect.get(globalForDb.podiumDb, prop, globalForDb.podiumDb);
  },
});
