import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { schools } from "@/db/schema";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { consoleMailer } from "@/lib/mailer/console";
import { createDailyJobs, runDaily } from "./daily";

const jobs = createDailyJobs({
  mailer: consoleMailer({ quiet: true }),
  notifier: null,
  appUrl: "http://test",
});

describe.skipIf(!testDatabaseUrl)("tareas diarias (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("recorre todas las escuelas y un error en una no detiene a las demás", async () => {
    const a = await schoolFixture(conn.db, "Cron A");
    const b = await schoolFixture(conn.db, "Cron B");
    const seen: string[] = [];
    const results = await runDaily(
      conn.db,
      new Date(),
      {
        probe: async (_db, school) => {
          seen.push(school.slug);
          if (school.slug === a.school.slug) throw new Error("falla controlada");
          return 1;
        },
      },
      [a.school.id, b.school.id],
    );
    expect(seen.sort()).toEqual([a.school.slug, b.school.slug].sort());
    expect(results.find((r) => r.school === a.school.slug)).toMatchObject({
      ok: false,
      error: "falla controlada",
    });
    expect(results.find((r) => r.school === b.school.slug)).toMatchObject({ ok: true, totals: { probe: 1 } });
  });

  it("en solo lectura solo corren la suscripción y la conciliación de pagos", async () => {
    const f = await schoolFixture(conn.db, "Cron solo lectura");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.update(schools).set({ status: "READ_ONLY" }).where(eq(schools.id, f.ctx.schoolId)),
    );
    const [result] = await runDaily(conn.db, new Date(), jobs, [f.school.id]);
    expect(Object.keys(result.totals ?? {}).sort()).toEqual([
      "notificationsDelivered",
      "onlinePaymentsReconciled",
      "subscription",
    ]);
  });

  it("las tareas reales son idempotentes", async () => {
    const f = await schoolFixture(conn.db, "Cron real");
    const only = (r: Awaited<ReturnType<typeof runDaily>>) => r.find((x) => x.school === f.school.slug);
    const first = only(await runDaily(conn.db, new Date(), jobs, [f.school.id]));
    expect(first?.ok).toBe(true);
    expect(first?.totals?.sessionsCreated).toBeGreaterThan(0);
    expect(only(await runDaily(conn.db, new Date(), jobs, [f.school.id]))?.totals).toEqual({
      subscription: 0,
      reactivatedEnrollments: 0,
      sessionsCreated: 0,
      attendanceReminders: 0,
      riskAlerts: 0,
      invoicesGenerated: 0,
      lateFees: 0,
      onlinePaymentsReconciled: 0,
      paymentReminders: 0,
      announcementsSent: 0,
      trialEmails: 0,
      notificationsDelivered: 0,
    });
  });
});
