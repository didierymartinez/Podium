import type { Database } from "@/db/rls";
import { todayIn } from "@/lib/dates";
import { reactivateFrozenEnrollments } from "@/modules/athletes/athletes";
import { notifyAtRisk, readAttendancePolicy, remindMissingAttendance } from "@/modules/attendance/alerts";
import { syncSessions } from "@/modules/attendance/sessions";
import { runInTenant } from "@/db/rls";
import { schools } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cronSchools, type CronSchool } from "./schools";

export type DailyJob = (database: Database, school: CronSchool, today: string, now: Date) => Promise<number>;

/** Tareas diarias por escuela. Todas deben ser idempotentes: correrlas dos veces el mismo día no duplica nada. */
export const DAILY_JOBS: Record<string, DailyJob> = {
  reactivatedEnrollments: (db, school, today) => reactivateFrozenEnrollments(db, school, today),
  sessionsCreated: async (db, school, today) => (await syncSessions(db, school, today)).created,
  attendanceReminders: (db, school, today) => remindMissingAttendance(db, school, today),
  riskAlerts: async (db, school, today) =>
    notifyAtRisk(db, school, today, await attendancePolicyOf(db, school.id)),
};

async function attendancePolicyOf(database: Database, schoolId: string) {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx.select({ settings: schools.settings }).from(schools).where(eq(schools.id, schoolId)),
  );
  return readAttendancePolicy(row?.settings.attendance);
}

/** Corre las tareas en cada escuela; un error en una escuela no detiene a las demás. */
export async function runDaily(
  database: Database,
  now = new Date(),
  jobs = DAILY_JOBS,
  /** Para pruebas: limitar a estas escuelas. */
  only?: string[],
) {
  const results: { school: string; ok: boolean; totals?: Record<string, number>; error?: string }[] = [];
  for (const school of await cronSchools(database)) {
    if (only && !only.includes(school.id)) continue;
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
