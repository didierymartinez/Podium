import { asc } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { guardians } from "@/db/schema";
import { todayIn } from "@/lib/dates";
import { diskStorage } from "@/lib/storage/local";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { cashDraft, closeCash, getClosing, listClosings } from "./cash";
import { recordPayment } from "./payments";
import { DEFAULT_BILLING_POLICY } from "./policy";

describe.skipIf(!testDatabaseUrl)("cierre de caja (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("suma por medio lo registrado por la persona en el día y cierra una sola vez", async () => {
    const f = await schoolFixture(conn.db);
    await f.athlete("Sofía");
    const [guardian] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(guardians).orderBy(asc(guardians.createdAt)),
    );
    const today = todayIn(f.school.timezone);
    const store = diskStorage({ dir: "/tmp/podium-cash-test", secret: "x" });
    const pay = (amount: number, method: "CASH" | "TRANSFER") =>
      recordPayment(
        conn.db,
        store,
        { ...f.ctx, slug: f.school.slug },
        {
          guardianId: guardian.id,
          amount,
          paidOn: today,
          method,
          reference: null,
          notes: null,
          proofFileId: null,
        },
        today,
        DEFAULT_BILLING_POLICY,
      );
    await pay(50_000, "CASH");
    await pay(30_000, "CASH");
    await pay(100_000, "TRANSFER");

    const draft = await cashDraft(conn.db, f.ctx.schoolId, f.owner.id, today, f.school.timezone);
    expect(draft.expected).toEqual({ CASH: 80_000, TRANSFER: 100_000, DEPOSIT: 0, CARD: 0 });
    expect(draft.payments).toHaveLength(3);
    // Otra persona no tiene nada que cerrar.
    expect(
      (await cashDraft(conn.db, f.ctx.schoolId, f.coachUser.id, today, f.school.timezone)).payments,
    ).toEqual([]);

    // Con diferencia hay que explicarla.
    expect(
      await closeCash(conn.db, f.ctx, today, f.school.timezone, { countedCash: 75_000, notes: "" }),
    ).toEqual({
      ok: false,
      errors: { notes: ["Explica la diferencia"] },
    });
    const closed = await closeCash(conn.db, f.ctx, today, f.school.timezone, {
      countedCash: 75_000,
      notes: "Faltan 5.000 de vueltas",
    });
    expect(closed).toMatchObject({ ok: true, difference: -5_000 });
    expect(
      await closeCash(conn.db, f.ctx, today, f.school.timezone, { countedCash: 80_000, notes: "" }),
    ).toEqual({
      ok: false,
      error: "closed",
    });
    const [listed] = await listClosings(conn.db, f.ctx.schoolId);
    expect(listed.closing.difference).toBe(-5_000);
    const detail = await getClosing(conn.db, f.ctx.schoolId, listed.closing.id);
    expect(detail?.payments).toHaveLength(3);
  });
});
