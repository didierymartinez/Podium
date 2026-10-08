import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { auditLogs, schools, subscriptions, users } from "@/db/schema";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import {
  activatePlanManually,
  extendTrial,
  listPlatformSchools,
  logSupportAccess,
  platformMetrics,
  platformSignups,
  setCoupon,
  suspendSchool,
  unsuspendSchool,
  type PlatformSchool,
} from "./console";

const row = (over: Partial<PlatformSchool>): PlatformSchool => ({
  id: "x",
  slug: "x",
  name: "x",
  city: "x",
  status: "TRIAL",
  created_at: new Date("2026-10-01T00:00:00Z"),
  trial_ends_at: null,
  suspended_at: null,
  comms_enabled_at: null,
  owner_name: "x",
  owner_email: "x",
  plan_code: null,
  subscription_status: null,
  billing_interval: null,
  discount_percent: 0,
  discount_until: null,
  current_period_end: null,
  canceled_at: null,
  active_athletes: 0,
  groups: 0,
  fee_plans: 0,
  coaches: 0,
  paid_invoices: 0,
  last_activity: null,
  ...over,
});

describe("métricas de la plataforma", () => {
  it("MRR, conversión, churn y configuración", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const m = platformMetrics(
      [
        row({
          status: "ACTIVE",
          plan_code: "semilla",
          billing_interval: "MONTHLY",
          paid_invoices: 2,
          created_at: new Date("2026-07-01"),
        }),
        row({
          status: "ACTIVE",
          plan_code: "club",
          billing_interval: "ANNUAL",
          paid_invoices: 1,
          created_at: new Date("2026-06-01"),
          discount_percent: 0,
        }),
        row({ status: "READ_ONLY", created_at: new Date("2026-08-01") }),
        row({
          status: "CANCELED",
          paid_invoices: 1,
          canceled_at: new Date("2026-10-05"),
          created_at: new Date("2026-05-01"),
        }),
        row({
          status: "TRIAL",
          fee_plans: 1,
          groups: 1,
          coaches: 1,
          active_athletes: 5,
          comms_enabled_at: new Date(),
        }),
      ],
      now,
    );
    expect(m.byStatus).toMatchObject({ ACTIVE: 2, READ_ONLY: 1, CANCELED: 1, TRIAL: 1 });
    expect(m.mrr).toBe(89_000 + Math.round((179_000 * 10) / 12));
    expect(m.conversion).toBe(3 / 4);
    expect(m.churn).toBe(1 / 3);
    expect(m.setup).toBe(1 / 5);
  });
});

describe.skipIf(!testDatabaseUrl)("consola de Podium (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("solo un super admin lista escuelas y actúa; todo queda auditado", async () => {
    const f = await schoolFixture(conn.db);
    const intruder = await createTestUser(conn.db, "intruso");
    const admin = await createTestUser(conn.db, "admin");
    await conn.db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, admin.id));

    expect(await listPlatformSchools(conn.db, intruder.id)).toEqual([]);
    expect(await platformSignups(conn.db, intruder.id, "2026-01-01")).toEqual([]);
    await expect(extendTrial(conn.db, intruder, f.ctx.schoolId, 10, new Date())).rejects.toThrow();

    const all = await listPlatformSchools(conn.db, admin.id);
    const mine = all.find((s) => s.id === f.ctx.schoolId)!;
    expect(mine).toMatchObject({
      status: "TRIAL",
      plan_code: "trial",
      active_athletes: 0,
      groups: 1,
      fee_plans: 1,
    });
    expect((await platformSignups(conn.db, admin.id, new Date().toISOString().slice(0, 10))).length).toBe(1);

    const now = new Date();
    expect(await extendTrial(conn.db, admin, f.ctx.schoolId, 15, now)).toBe(true);
    expect(await setCoupon(conn.db, admin, f.ctx.schoolId, { percent: 50, until: "2027-12-31" })).toBe(true);
    expect(
      await activatePlanManually(
        conn.db,
        admin,
        f.ctx.schoolId,
        { planCode: "club", interval: "MONTHLY" },
        now,
      ),
    ).toBe(true);
    expect(await suspendSchool(conn.db, admin, f.ctx.schoolId, "Envío de spam", now)).toBe(true);
    expect(await logSupportAccess(conn.db, admin, f.ctx.schoolId, "Ticket #123 de soporte")).toBe(
      f.school.slug,
    );
    expect(await unsuspendSchool(conn.db, admin, f.ctx.schoolId)).toBe(true);

    const state = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => ({
      school: (await tx.select().from(schools).where(eq(schools.id, f.ctx.schoolId)))[0],
      sub: (await tx.select().from(subscriptions).where(eq(subscriptions.schoolId, f.ctx.schoolId)))[0],
      audit: await tx.select().from(auditLogs).where(eq(auditLogs.actorUserId, admin.id)),
    }));
    expect(state.school).toMatchObject({ status: "ACTIVE", suspendedAt: null });
    expect(state.sub).toMatchObject({ status: "ACTIVE", planCode: "club", discountPercent: 50 });
    expect(state.audit.map((a) => a.action).sort()).toEqual([
      "platform.coupon",
      "platform.plan_activated",
      "platform.support_access",
      "platform.suspended",
      "platform.trial_extended",
      "platform.unsuspended",
    ]);
  });
});
