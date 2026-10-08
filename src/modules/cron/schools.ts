import { sql } from "drizzle-orm";
import type { Database } from "@/db/rls";

export type CronSchool = {
  id: string;
  slug: string;
  timezone: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "READ_ONLY" | "CANCELED";
};

/** Escuelas vigentes (función SECURITY DEFINER `cron_schools`, la app no puede listarlas con RLS). */
export async function cronSchools(database: Database): Promise<CronSchool[]> {
  const rows = await database.execute<CronSchool>(sql`select id, slug, timezone, status from cron_schools()`);
  return [...rows];
}
