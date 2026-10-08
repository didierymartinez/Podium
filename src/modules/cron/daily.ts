import type { Database } from "@/db/rls";
import { todayIn } from "@/lib/dates";
import { reactivateFrozenEnrollments } from "@/modules/athletes/athletes";
import { syncSessions } from "@/modules/attendance/sessions";
import { cronSchools, type CronSchool } from "./schools";

export type DailyJob = (database: Database, school: CronSchool, today: string, now: Date) => Promise<number>;

/** Tareas diarias por escuela. Todas deben ser idempotentes: correrlas dos veces el mismo día no duplica nada. */
export const DAILY_JOBS: Record<string, DailyJob> = {
  reactivatedEnrollments: (db, school, today) => reactivateFrozenEnrollments(db, school, today),
  sessionsCreated: async (db, school, today) => (await syncSessions(db, school, today)).created,
};

/** Corre las tareas en cada escuela; un error en una escuela no detiene a las demás. */
export async function runDaily(database: Database, now = new Date(), jobs = DAILY_JOBS) {
  const results: { school: string; ok: boolean; totals?: Record<string, number>; error?: string }[] = [];
  for (const school of await cronSchools(database)) {
    const today = todayIn(school.timezone, now);
    try {
      const totals: Record<string, number> = {};
      for (const [name, job] of Object.entries(jobs)) totals[name] = await job(database, school, today, now);
      results.push({ school: school.slug, ok: true, totals });
    } catch (err) {
      results.push({
        school: school.slug,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
