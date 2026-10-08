import { sql } from "drizzle-orm";
import type { Database } from "@/db/rls";

export type Limit = { max: number; windowSeconds: number };

/** "20/600" → 20 intentos cada 600 segundos. */
export function parseLimit(value: string | undefined, fallback: Limit): Limit {
  const m = value?.match(/^(\d+)\/(\d+)$/);
  return m ? { max: Number(m[1]), windowSeconds: Number(m[2]) } : fallback;
}

/**
 * Cuenta un intento para `key` en la ventana actual (ventana fija, en Postgres para que funcione igual en
 * cualquier servidor). Devuelve si se permite y cuántos segundos faltan para la siguiente ventana.
 */
export async function hitRateLimit(
  database: Database,
  key: string,
  limit: Limit,
  now: Date = new Date(),
): Promise<{ allowed: boolean; retryAfter: number }> {
  const windowMs = limit.windowSeconds * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await database.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${start.toISOString()}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  // Limpieza ocasional de ventanas viejas.
  if (Math.random() < 0.02) {
    await database.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  }
  const retryAfter = Math.ceil((start.getTime() + windowMs - now.getTime()) / 1000);
  return { allowed: Number(row.count) <= limit.max, retryAfter };
}
