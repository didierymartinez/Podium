import { eq, inArray } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { Tx } from "./rls";

/**
 * Las llaves foráneas no pasan por RLS: antes de referenciar un registro (grupo, tarifa, nivel…)
 * verificamos que sea visible en la escuela actual. Devuelve false si alguno no existe o es de otra escuela.
 */
export async function allVisible(
  tx: Tx,
  table: PgTable & { id: PgColumn },
  ids: (string | null | undefined)[],
): Promise<boolean> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return true;
  const rows = await tx
    .select({ id: table.id })
    .from(table)
    .where(wanted.length === 1 ? eq(table.id, wanted[0]) : inArray(table.id, wanted));
  return rows.length === wanted.length;
}
