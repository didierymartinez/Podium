import type { Database } from "@/db/rls";
import { todayIn } from "@/lib/dates";
import { reactivateFrozenEnrollments } from "@/modules/athletes/athletes";
import { notifyAtRisk, readAttendancePolicy, remindMissingAttendance } from "@/modules/attendance/alerts";
import { syncSessions } from "@/modules/attendance/sessions";
import { runInTenant } from "@/db/rls";
import { schools } from "@/db/schema";
import { eq } from "drizzle-orm";
import { addLateFees, generateMonth } from "@/modules/billing/invoices";
import { reconcileIntents } from "@/modules/billing/online";
import { readBillingPolicy } from "@/modules/billing/policy";
import { sendPaymentReminders } from "@/modules/billing/reminders";
import { wompiProvider } from "@/modules/payments/wompi";
import { cronSchools, type CronSchool } from "./schools";

export type DailyJob = (database: Database, school: CronSchool, today: string, now: Date) => Promise<number>;

async function settingsOf(database: Database, schoolId: string) {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx.select({ settings: schools.settings }).from(schools).where(eq(schools.id, schoolId)),
  );
  return row?.settings;
}
const billingPolicyOf = async (db: Database, id: string) =>
  readBillingPolicy((await settingsOf(db, id))?.billing);
const systemCtx = (school: CronSchool) => ({ schoolId: school.id, actorUserId: null, slug: school.slug });

/**
 * Tareas diarias por escuela, en este orden. Todas son idempotentes: correrlas dos veces el mismo día
 * no duplica nada. Se programan a las 9:00 a. m. (hora de Bogotá) por el horario de la Ley 2300.
 */
export const DAILY_JOBS: Record<string, DailyJob> = {
  reactivatedEnrollments: (db, school, today) => reactivateFrozenEnrollments(db, school, today),
  sessionsCreated: async (db, school, today) => (await syncSessions(db, school, today)).created,
  attendanceReminders: (db, school, today) => remindMissingAttendance(db, school, today),
  riskAlerts: async (db, school, today) =>
    notifyAtRisk(db, school, today, readAttendancePolicy((await settingsOf(db, school.id))?.attendance)),
  // Desde el día de generación crea las mensualidades que falten (incluye ingresos a mitad de mes).
  invoicesGenerated: async (db, school, today) => {
    const policy = await billingPolicyOf(db, school.id);
    if (Number(today.slice(8, 10)) < policy.generationDay) return 0;
    return (await generateMonth(db, systemCtx(school), today.slice(0, 7), today, policy)).invoices;
  },
  lateFees: async (db, school, today) =>
    addLateFees(db, systemCtx(school), today, await billingPolicyOf(db, school.id)),
  onlinePaymentsReconciled: async (db, school, _today, now) =>
    reconcileIntents(db, wompiProvider(), school, now, await billingPolicyOf(db, school.id)),
  paymentReminders: (db, school, _today, now) => sendPaymentReminders(db, school, now),
};

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
