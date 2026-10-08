import { describe, expect, it } from "vitest";
import { DEFAULT_BILLING_POLICY, billingPolicySchema, readBillingPolicy, type BillingPolicy } from "./policy";
import { adjustmentAmount, amountDueOn, firstMonthAmount, monthlyChargeLines } from "./pricing";

// Ejemplo de docs/GESTION_ADMINISTRATIVA.md §6.2
const policy: BillingPolicy = {
  ...DEFAULT_BILLING_POLICY,
  generationDay: 1,
  dueDay: 10,
  siblingDiscount: { type: "percent", value: 10 },
  earlyPayment: { type: "percent", value: 5, untilDay: 5 },
  lateFee: { type: "fixed", value: 10000 },
};

describe("pricing", () => {
  it("reproduce el ejemplo de Laura con dos hijos", () => {
    const lines = monthlyChargeLines(
      [
        { label: "Tomás — Iniciación", amount: 120000 },
        { label: "Sofía — Competencia", amount: 180000 },
      ],
      policy,
    );
    expect(lines.map((l) => [l.siblingDiscount, l.total])).toEqual([
      [12000, 108000],
      [0, 180000],
    ]);
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    expect(subtotal).toBe(288000);
    expect(amountDueOn(subtotal, 4, policy).total).toBe(273600);
    expect(amountDueOn(subtotal, 8, policy).total).toBe(288000);
    expect(amountDueOn(subtotal, 15, policy).total).toBe(298000);
  });

  it("los descuentos nunca superan la base", () => {
    expect(adjustmentAmount(50000, { type: "fixed", value: 80000 })).toBe(50000);
    expect(adjustmentAmount(50000, { type: "none", value: 10 })).toBe(0);
  });

  it("calcula el primer mes según la política de ingreso", () => {
    expect(firstMonthAmount(120000, 16, 30, { midMonthJoin: "full" })).toBe(120000);
    expect(firstMonthAmount(120000, 16, 30, { midMonthJoin: "next_month" })).toBe(0);
    expect(firstMonthAmount(120000, 16, 30, { midMonthJoin: "prorated" })).toBe(60000);
    expect(firstMonthAmount(120000, 1, 30, { midMonthJoin: "next_month" })).toBe(120000);
  });
});

describe("billing policy", () => {
  it("completa valores por defecto para escuelas antiguas", () => {
    expect(readBillingPolicy({ generationDay: 3, dueDay: 12 })).toMatchObject({
      generationDay: 3,
      dueDay: 12,
      invoicePrefix: "CC",
    });
  });

  it("valida reglas de negocio", () => {
    expect(billingPolicySchema.safeParse({ ...policy, dueDay: 0 }).success).toBe(false);
    expect(billingPolicySchema.safeParse({ ...policy, generationDay: 15, dueDay: 10 }).success).toBe(false);
    expect(
      billingPolicySchema.safeParse({ ...policy, earlyPayment: { type: "percent", value: 5, untilDay: 12 } })
        .success,
    ).toBe(false);
    expect(
      billingPolicySchema.safeParse({ ...policy, lateFee: { type: "percent", value: 150 } }).success,
    ).toBe(false);
  });
});
