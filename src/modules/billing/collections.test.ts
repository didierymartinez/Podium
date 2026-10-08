import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { asc } from "drizzle-orm";
import { guardians, notifications } from "@/db/schema";
import { diskStorage } from "@/lib/storage/local";
import { addDays } from "@/lib/dates";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import {
  addCollectionNote,
  cancelPaymentPlan,
  collectionFlags,
  createPaymentPlan,
  getActivePaymentPlan,
  installmentStates,
  listCollectionNotes,
  runCollectionFollowUps,
  splitInstallments,
} from "./collections";
import { recordPayment } from "./payments";
import { DEFAULT_BILLING_POLICY } from "./policy";

describe("acuerdos de pago", () => {
  it("divide en cuotas mensuales exactas", () => {
    expect(splitInstallments(100_000, 3, "2026-01-31")).toEqual([
      { position: 1, dueOn: "2026-01-31", amount: 33_333 },
      { position: 2, dueOn: "2026-02-28", amount: 33_333 },
      { position: 3, dueOn: "2026-03-31", amount: 33_334 },
    ]);
  });

  it("marca cuotas cumplidas por lo pagado acumulado", () => {
    const inst = splitInstallments(90_000, 3, "2026-10-10");
    expect(installmentStates(inst, 40_000, "2026-11-15")).toEqual(["covered", "overdue", "pending"]);
    expect(installmentStates(inst, 90_000, "2027-01-01")).toEqual(["covered", "covered", "covered"]);
  });
});

describe.skipIf(!testDatabaseUrl)("gestión de cobro (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("bitácora con compromisos, acuerdo de pago y seguimiento diario", async () => {
    const f = await schoolFixture(conn.db);
    await f.athlete("Sofía");
    const [guardian] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(guardians).orderBy(asc(guardians.createdAt)),
    );
    const school = { id: f.ctx.schoolId, slug: f.school.slug, timezone: f.school.timezone };
    const today = f.today;

    expect((await addCollectionNote(conn.db, f.ctx, guardian.id, { kind: "CALL", note: "x" })).ok).toBe(
      false,
    );
    await addCollectionNote(conn.db, f.ctx, guardian.id, {
      kind: "CALL",
      note: "Dice que paga el viernes",
      promiseOn: today,
      promiseAmount: 50_000,
    });
    expect((await collectionFlags(conn.db, f.ctx.schoolId, [guardian.id])).get(guardian.id)).toEqual({
      plan: false,
      promiseOn: today,
    });

    // Al día siguiente, sin pago: compromiso incumplido y aviso a la administración.
    expect(await runCollectionFollowUps(conn.db, school, addDays(today, 1))).toBe(1);
    expect((await listCollectionNotes(conn.db, f.ctx.schoolId, guardian.id))[0].promiseStatus).toBe("BROKEN");
    const inbox = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(notifications),
    );
    expect(inbox.some((n) => n.kind === "collection.promise_broken")).toBe(true);
    expect(await runCollectionFollowUps(conn.db, school, addDays(today, 1))).toBe(0);

    // Acuerdo de 3 cuotas; un pago cubre la primera.
    const created = await createPaymentPlan(
      conn.db,
      f.ctx,
      guardian.id,
      { total: 90_000, installments: 3, firstDueOn: today, notes: "" },
      today,
    );
    expect(created.ok).toBe(true);
    await recordPayment(
      conn.db,
      diskStorage({ dir: "/tmp/podium-collections-test", secret: "x" }),
      { ...f.ctx, slug: f.school.slug },
      {
        guardianId: guardian.id,
        amount: 30_000,
        paidOn: today,
        method: "CASH",
        reference: null,
        notes: null,
        proofFileId: null,
      },
      today,
      DEFAULT_BILLING_POLICY,
    );
    const plan = await getActivePaymentPlan(conn.db, f.ctx.schoolId, guardian.id, today);
    expect(plan?.installments.map((i) => i.state)).toEqual(["covered", "pending", "pending"]);
    expect(plan?.paid).toBe(30_000);
    expect(await cancelPaymentPlan(conn.db, f.ctx, plan!.plan.id)).toBe(true);
    expect(await getActivePaymentPlan(conn.db, f.ctx.schoolId, guardian.id, today)).toBeNull();
  });
});
