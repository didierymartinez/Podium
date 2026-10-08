import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { enrollments } from "@/db/schema";
import { diskStorage } from "@/lib/storage/local";
import { changeEnrollmentStatus } from "@/modules/athletes/athletes";
import { listGuardians } from "@/modules/athletes/guardians";
import { generateMonth } from "@/modules/billing/invoices";
import { recordPayment } from "@/modules/billing/payments";
import { DEFAULT_BILLING_POLICY } from "@/modules/billing/policy";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { billedVsCollected, businessMetrics, monthEnd, ratio, shiftMonth } from "./metrics";

describe("fechas del tablero", () => {
  it("meses", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 3)).toBe("2027-02");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(ratio(1, 0)).toBe(0);
  });
});

describe.skipIf(!testDatabaseUrl)("indicadores del negocio (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("recaudo, cartera, altas, retiros, retención y ocupación", async () => {
    const f = await schoolFixture(conn.db);
    const today = "2026-10-15";
    const policy = { ...DEFAULT_BILLING_POLICY, dueDay: 10, generationDay: 1 };
    // Dos alumnos antiguos (septiembre) y uno nuevo de octubre.
    await f.athlete("Ana", { startDate: "2026-09-01" });
    const bruno = await f.athlete("Bruno", { startDate: "2026-09-01" });
    await f.athlete("Carla", { startDate: "2026-10-01" });
    const ctx = { ...f.ctx, slug: f.school.slug };
    await generateMonth(conn.db, ctx, "2026-10", "2026-10-01", policy);

    const [guardian] = await listGuardians(conn.db, f.ctx.schoolId);
    const paid = await recordPayment(
      conn.db,
      diskStorage({ dir: "/tmp/podium-dashboard-test", secret: "x" }),
      ctx,
      {
        guardianId: guardian.id,
        amount: 100_000,
        paidOn: "2026-10-05",
        method: "CASH",
        reference: null,
        notes: null,
        proofFileId: null,
      },
      today,
      policy,
    );
    expect(paid.ok).toBe(true);

    const [brunoEnrollment] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(enrollments),
    ).then((rows) => rows.filter((r) => r.athleteId === bruno));
    await changeEnrollmentStatus(conn.db, f.ctx, brunoEnrollment.id, {
      to: "WITHDRAWN",
      date: "2026-10-12",
      reason: "ECONOMIC",
    });

    const m = await businessMetrics(conn.db, f.ctx.schoolId, today);
    expect(m).toMatchObject({
      period: "2026-10",
      collected: 100_000,
      billed: 300_000,
      overdue: 200_000,
      activeAthletes: 2,
      newAthletes: 1,
      withdrawnAthletes: 1,
      activeAtStart: 2,
      retention: 0.5,
      enrolled: 2,
      capacity: 10,
      occupancy: 0.2,
      averageRevenue: 150_000,
      pendingOnlinePayments: { count: 0, amount: 0 },
    });
    expect(m.collectionRate).toBeCloseTo(1 / 3);

    const trend = await billedVsCollected(conn.db, f.ctx.schoolId, today, 3);
    expect(trend).toEqual([
      { period: "2026-08", billed: 0, collected: 0 },
      { period: "2026-09", billed: 0, collected: 0 },
      { period: "2026-10", billed: 300_000, collected: 100_000 },
    ]);
  });
});
