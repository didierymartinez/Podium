import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFeePlan } from "@/modules/billing/fee-plans";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { randomMobile, schoolFixture } from "@/test/fixtures";
import { diskStorage } from "@/lib/storage/local";
import { listGuardians } from "@/modules/athletes/guardians";
import {
  addCreditNote,
  addLateFees,
  chargeOneTime,
  generateMonth,
  getInvoice,
  listInvoices,
  previewMonth,
  regenerateInvoice,
  voidInvoice,
} from "./invoices";
import { getPayment, recordPayment, voidPayment } from "./payments";
import { DEFAULT_BILLING_POLICY, type BillingPolicy } from "./policy";
import { agingBucket, agingReport, athleteBillingStatus, guardianStatement } from "./statement";

/** Política del ejemplo de docs/GESTION_ADMINISTRATIVA.md §6.2. */
const policy: BillingPolicy = {
  ...DEFAULT_BILLING_POLICY,
  generationDay: 1,
  dueDay: 10,
  siblingDiscount: { type: "percent", value: 10 },
  lateFee: { type: "fixed", value: 10_000 },
  earlyPayment: { type: "percent", value: 5, untilDay: 5 },
};

describe("cartera por edades", () => {
  it("clasifica por días de vencida", () => {
    expect(agingBucket("2026-10-10", "2026-10-10")).toBe("current");
    expect(agingBucket("2026-10-10", "2026-10-11")).toBe("d1_30");
    expect(agingBucket("2026-08-10", "2026-10-10")).toBe("d61_90");
    expect(agingBucket("2026-01-10", "2026-10-10")).toBe("d90");
  });
});

describe.skipIf(!testDatabaseUrl)("cobros, pagos y cartera (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  const store = diskStorage({ dir: "/tmp/podium-billing-test", secret: "x" });
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  async function family() {
    const f = await schoolFixture(conn.db);
    const ctx = { ...f.ctx, slug: f.school.slug };
    const competition = await createFeePlan(conn.db, f.ctx, {
      name: "Competencia",
      description: null,
      monthlyAmount: 180_000,
    });
    const beginners = await createFeePlan(conn.db, f.ctx, {
      name: "Iniciación",
      description: null,
      monthlyAmount: 120_000,
    });
    const phone = randomMobile("30");
    const sofia = await f.athlete("Sofía", {
      guardianPhone: phone,
      feePlanId: competition.id,
      startDate: "2026-09-01",
    });
    const tomas = await f.athlete("Tomás", {
      guardianPhone: phone,
      feePlanId: beginners.id,
      startDate: "2026-09-01",
    });
    const [laura] = await listGuardians(conn.db, f.ctx.schoolId);
    return { f, ctx, sofia, tomas, laura };
  }

  it("genera la cuenta del mes con hermanos, sin duplicar, y aplica pronto pago", async () => {
    const { f, ctx, laura } = await family();
    const preview = (await previewMonth(conn.db, f.ctx.schoolId, "2026-10", policy)).invoices;
    expect(preview).toHaveLength(1);
    expect(preview[0].lines.map((l) => [l.baseAmount, l.siblingDiscount, l.amount])).toEqual([
      [180_000, 0, 180_000],
      [120_000, 12_000, 108_000],
    ]);
    const first = await generateMonth(conn.db, ctx, "2026-10", "2026-10-01", policy);
    expect(first).toMatchObject({ invoices: 1, total: 288_000 });
    expect(await generateMonth(conn.db, ctx, "2026-10", "2026-10-01", policy)).toMatchObject({ invoices: 0 });
    const [invoice] = await listInvoices(conn.db, f.ctx.schoolId, { today: "2026-10-01" });
    expect(invoice).toMatchObject({
      code: "CC-0001",
      dueOn: "2026-10-10",
      status: "PENDING",
      total: 288_000,
    });

    // Paga el día 4 con 5 % de pronto pago: $273.600.
    const paid = await recordPayment(
      conn.db,
      store,
      ctx,
      {
        guardianId: laura.id,
        amount: 273_600,
        paidOn: "2026-10-04",
        method: "CASH",
        reference: null,
        notes: null,
        proofFileId: null,
      },
      "2026-10-04",
      policy,
    );
    expect(paid).toMatchObject({ ok: true, code: "RC-0001", applied: 273_600, credit: 0 });
    const detail = await getInvoice(conn.db, f.ctx.schoolId, invoice.id);
    expect(detail?.invoice).toMatchObject({ status: "PAID", credited: 14_400, paid: 273_600 });
    expect(detail?.creditNotes[0]).toMatchObject({ kind: "EARLY_PAYMENT", amount: 14_400 });
  });

  it("recargo por mora una sola vez, saldo a favor que se aplica al mes siguiente y anulaciones", async () => {
    const { f, ctx, laura, sofia } = await family();
    await generateMonth(conn.db, ctx, "2026-10", "2026-10-01", policy);
    expect(await addLateFees(conn.db, ctx, "2026-10-10", policy)).toBe(0);
    expect(await addLateFees(conn.db, ctx, "2026-10-11", policy)).toBe(1);
    expect(await addLateFees(conn.db, ctx, "2026-10-12", policy)).toBe(0);
    const [october] = await listInvoices(conn.db, f.ctx.schoolId, { today: "2026-10-15" });
    expect(october.total).toBe(298_000);
    expect((await athleteBillingStatus(conn.db, f.ctx.schoolId, [sofia], "2026-10-15")).get(sofia)).toEqual({
      overdue: true,
      balance: 298_000,
    });
    const aging = await agingReport(conn.db, f.ctx.schoolId, "2026-10-15");
    expect(aging.totals.d1_30).toBe(298_000);
    expect(aging.debtors[0]).toMatchObject({
      name: laura.firstName + " " + laura.lastName,
      overdue: 298_000,
    });

    // Paga de más el día 15: sin pronto pago, queda saldo a favor de $2.000.
    const pay = await recordPayment(
      conn.db,
      store,
      ctx,
      {
        guardianId: laura.id,
        amount: 300_000,
        paidOn: "2026-10-15",
        method: "TRANSFER",
        reference: "123",
        notes: null,
        proofFileId: null,
      },
      "2026-10-15",
      policy,
    );
    if (!pay.ok) throw new Error("pay");
    expect(pay.credit).toBe(2_000);
    // Noviembre descuenta el saldo a favor.
    await generateMonth(conn.db, ctx, "2026-11", "2026-11-01", policy);
    const [november] = await listInvoices(conn.db, f.ctx.schoolId, {
      today: "2026-11-01",
      period: "2026-11",
    });
    expect(november).toMatchObject({ total: 288_000, paid: 2_000, status: "PARTIAL" });

    // Nota crédito mayor al saldo: rechazada; menor: aplicada.
    expect(await addCreditNote(conn.db, f.ctx, november.id, { amount: 999_999, reason: "Error" })).toEqual({
      ok: false,
      error: "exceeds_balance",
    });
    expect(
      await addCreditNote(conn.db, f.ctx, november.id, { amount: 6_000, reason: "Beca parcial" }),
    ).toEqual({ ok: true });

    // Anular el pago de octubre: la cuenta vuelve a quedar con saldo y noviembre pierde el saldo a favor.
    expect(await voidPayment(conn.db, f.ctx, pay.paymentId, "Transferencia rechazada", policy)).toBe(true);
    const afterVoid = await getInvoice(conn.db, f.ctx.schoolId, october.id);
    expect(afterVoid?.invoice).toMatchObject({ status: "PENDING", paid: 0 });
    expect((await getPayment(conn.db, f.ctx.schoolId, pay.paymentId))?.payment.status).toBe("VOID");

    // Estado de cuenta: debe octubre + noviembre − nota crédito.
    const statement = await guardianStatement(conn.db, f.ctx.schoolId, laura.id);
    expect(statement?.owed).toBe(298_000 + 288_000 - 6_000);
    expect(statement?.movements.at(-1)?.balance).toBe(298_000 + 288_000 - 6_000);
  });

  it("anular una cuenta pagada deja saldo a favor; regenerar; cobros únicos agrupados por responsable", async () => {
    const { f, ctx, laura, sofia, tomas } = await family();
    await generateMonth(conn.db, ctx, "2026-10", "2026-10-01", policy);
    const [october] = await listInvoices(conn.db, f.ctx.schoolId, { today: "2026-10-01" });
    // Regenerar una cuenta sin pagos: se anula y se crea otra con el siguiente número.
    const regenerated = await regenerateInvoice(conn.db, ctx, october.id, "2026-10-02", policy);
    expect(regenerated.ok).toBe(true);
    const all = await listInvoices(conn.db, f.ctx.schoolId, { today: "2026-10-02" });
    expect(all.map((i) => [i.code, i.status])).toEqual([
      ["CC-0002", "PENDING"],
      ["CC-0001", "VOID"],
    ]);

    await recordPayment(
      conn.db,
      store,
      ctx,
      {
        guardianId: laura.id,
        amount: 288_000,
        paidOn: "2026-10-08",
        method: "CASH",
        reference: null,
        notes: null,
        proofFileId: null,
      },
      "2026-10-08",
      policy,
    );
    expect(await voidInvoice(conn.db, f.ctx, all[0].id, "Se retiraron", policy)).toBe(true);
    const statement = await guardianStatement(conn.db, f.ctx.schoolId, laura.id);
    expect(statement).toMatchObject({ owed: 0, credit: 288_000 });

    // Uniforme para los dos hermanos: una cuenta con dos líneas, pagada con el saldo a favor.
    const charge = await chargeOneTime(
      conn.db,
      ctx,
      { athleteIds: [sofia, tomas], description: "Licra", amount: 90_000, dueOn: "2026-10-20" },
      "2026-10-09",
      policy,
    );
    if (!charge.ok) throw new Error("charge");
    expect(charge.invoiceIds).toHaveLength(1);
    const uniform = await getInvoice(conn.db, f.ctx.schoolId, charge.invoiceIds[0]);
    expect(uniform?.lines.map((l) => l.description)).toEqual(["Licra · Sofía", "Licra · Tomás"]);
    expect(uniform?.invoice).toMatchObject({ total: 180_000, status: "PAID" });
    expect((await guardianStatement(conn.db, f.ctx.schoolId, laura.id))?.credit).toBe(108_000);
  });

  it("otra escuela no ve cuentas ni registra pagos ajenos", async () => {
    const a = await family();
    const b = await family();
    await generateMonth(conn.db, a.ctx, "2026-10", "2026-10-01", policy);
    const [invoice] = await listInvoices(conn.db, a.f.ctx.schoolId, { today: "2026-10-01" });
    expect(await getInvoice(conn.db, b.f.ctx.schoolId, invoice.id)).toBeNull();
    expect(
      await recordPayment(
        conn.db,
        store,
        b.ctx,
        {
          guardianId: a.laura.id,
          amount: 1000,
          paidOn: "2026-10-02",
          method: "CASH",
          reference: null,
          notes: null,
          proofFileId: null,
        },
        "2026-10-02",
        policy,
      ),
    ).toEqual({ ok: false, error: "not_found" });
  });
});
