import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diskStorage } from "@/lib/storage/local";
import { listGuardians } from "@/modules/athletes/guardians";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { deleteExpense, listExpenses, profitReport, recordExpense } from "./expenses";
import { createProduct, listProducts, moveStock, sellProduct } from "./inventory";
import { getInvoice } from "./invoices";
import { recordPayment } from "./payments";
import { DEFAULT_BILLING_POLICY as policy } from "./policy";

describe.skipIf(!testDatabaseUrl)("egresos, utilidad e inventario (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  const store = diskStorage({ dir: "/tmp/podium-expenses-test", secret: "x" });
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("utilidad = recaudo + ventas de contado − egresos; el inventario no queda negativo", async () => {
    const f = await schoolFixture(conn.db);
    const ctx = { ...f.ctx, slug: f.school.slug };
    const sofia = await f.athlete("Sofía");
    const [laura] = await listGuardians(conn.db, f.ctx.schoolId);
    const month = "2026-09";

    await recordPayment(
      conn.db,
      store,
      ctx,
      {
        guardianId: laura.id,
        amount: 300_000,
        paidOn: "2026-09-10",
        method: "CASH",
        reference: null,
        notes: null,
        proofFileId: null,
      },
      "2026-09-10",
      policy,
    );
    const rent = await recordExpense(
      conn.db,
      f.ctx,
      {
        category: "VENUE",
        description: "Arriendo pista septiembre",
        amount: 120_000,
        spentOn: "2026-09-05",
        method: "TRANSFER",
      },
      "2026-09-30",
    );
    await recordExpense(
      conn.db,
      f.ctx,
      {
        category: "PAYROLL",
        description: "Honorarios profesor",
        amount: 150_000,
        spentOn: "2026-09-30",
        method: "TRANSFER",
      },
      "2026-09-30",
    );
    expect(
      await recordExpense(
        conn.db,
        f.ctx,
        { category: "OTHER", description: "Futuro", amount: 1, spentOn: "2026-10-30", method: "CASH" },
        "2026-09-30",
      ),
    ).toBeNull();

    // Inventario: entrada, venta de contado y venta a la cuenta del alumno.
    const created = await createProduct(conn.db, f.ctx, { name: "Licra", price: 60_000 });
    if (!created.ok) throw new Error("product");
    expect(await createProduct(conn.db, f.ctx, { name: "Licra", price: 1 })).toEqual({
      ok: false,
      error: "exists",
    });
    expect(
      await moveStock(
        conn.db,
        f.ctx,
        { productId: created.id, quantity: 3, kind: "IN", note: null },
        "2026-09-01",
      ),
    ).toBe(true);
    expect(
      await moveStock(
        conn.db,
        f.ctx,
        { productId: created.id, quantity: -5, kind: "ADJUST", note: null },
        "2026-09-01",
      ),
    ).toBe(false);
    expect(
      await sellProduct(
        conn.db,
        ctx,
        { productId: created.id, quantity: 1, athleteId: null, method: "CASH" },
        "2026-09-12",
        policy,
      ),
    ).toEqual({ ok: true, total: 60_000, invoiceId: null });
    const toAccount = await sellProduct(
      conn.db,
      ctx,
      { productId: created.id, quantity: 2, athleteId: sofia, method: null },
      "2026-09-12",
      policy,
    );
    expect(toAccount).toMatchObject({ ok: true, total: 120_000 });
    if (!toAccount.ok) throw new Error("sale");
    const invoice = await getInvoice(conn.db, f.ctx.schoolId, toAccount.invoiceId!);
    expect(invoice?.lines.map((l) => l.description)).toEqual(["Licra x2 · Sofía"]);
    expect(
      await sellProduct(
        conn.db,
        ctx,
        { productId: created.id, quantity: 1, athleteId: null, method: "CASH" },
        "2026-09-12",
        policy,
      ),
    ).toEqual({ ok: false, error: "no_stock" });
    expect((await listProducts(conn.db, f.ctx.schoolId))[0].stock).toBe(0);

    const [september] = await profitReport(conn.db, f.ctx.schoolId, [month]);
    // El saldo a favor de 300.000 pagó la compra de 120.000: el recaudo es el pago, no la venta a cuenta.
    expect(september).toMatchObject({
      collected: 300_000,
      cashSales: 60_000,
      income: 360_000,
      expenses: 270_000,
      profit: 90_000,
    });
    expect(september.byCategory).toMatchObject({ VENUE: 120_000, PAYROLL: 150_000, OTHER: 0 });

    expect(await deleteExpense(conn.db, f.ctx, rent!)).toBe(true);
    expect(
      (await listExpenses(conn.db, f.ctx.schoolId, "2026-09-01", "2026-09-30")).map((e) => e.description),
    ).toEqual(["Honorarios profesor"]);
  });
});
