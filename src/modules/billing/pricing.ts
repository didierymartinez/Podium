import type { Adjustment, BillingPolicy } from "./policy";

/** Valor del ajuste sobre una base, en pesos enteros. Nunca supera la base. */
export function adjustmentAmount(base: number, adjustment: Adjustment): number {
  if (adjustment.type === "none" || base <= 0) return 0;
  const raw = adjustment.type === "percent" ? Math.round((base * adjustment.value) / 100) : adjustment.value;
  return Math.min(raw, base);
}

export type ChargeLineInput = { label: string; amount: number };
export type ChargeLine = ChargeLineInput & { siblingDiscount: number; total: number };

/**
 * Líneas de la cuenta de cobro mensual de un responsable de pago.
 * El descuento de hermanos aplica desde la 2.ª matrícula; paga completo la de mayor valor.
 */
export function monthlyChargeLines(lines: ChargeLineInput[], policy: BillingPolicy): ChargeLine[] {
  const order = lines.map((line, index) => ({ line, index })).sort((a, b) => b.line.amount - a.line.amount);
  const result: ChargeLine[] = new Array(lines.length);
  order.forEach(({ line, index }, rank) => {
    const siblingDiscount = rank === 0 ? 0 : adjustmentAmount(line.amount, policy.siblingDiscount);
    result[index] = { ...line, siblingDiscount, total: line.amount - siblingDiscount };
  });
  return result;
}

export type AmountDue = { subtotal: number; earlyPaymentDiscount: number; lateFee: number; total: number };

/** Lo que se paga según el día del mes en que se paga. */
export function amountDueOn(subtotal: number, payDay: number, policy: BillingPolicy): AmountDue {
  const earlyPaymentDiscount =
    payDay <= policy.earlyPayment.untilDay ? adjustmentAmount(subtotal, policy.earlyPayment) : 0;
  const lateFee = payDay > policy.dueDay ? adjustmentAmountUncapped(subtotal, policy.lateFee) : 0;
  return { subtotal, earlyPaymentDiscount, lateFee, total: subtotal - earlyPaymentDiscount + lateFee };
}

function adjustmentAmountUncapped(base: number, adjustment: Adjustment): number {
  if (adjustment.type === "none") return 0;
  return adjustment.type === "percent" ? Math.round((base * adjustment.value) / 100) : adjustment.value;
}

/**
 * Valor del primer mes cuando el alumno entra a mitad de mes.
 * `joinDay` es el día de ingreso (1 = mes completo) y `daysInMonth` los días del mes.
 */
export function firstMonthAmount(
  amount: number,
  joinDay: number,
  daysInMonth: number,
  policy: Pick<BillingPolicy, "midMonthJoin">,
): number {
  if (joinDay <= 1 || policy.midMonthJoin === "full") return amount;
  if (policy.midMonthJoin === "next_month") return 0;
  const remaining = daysInMonth - joinDay + 1;
  return Math.round((amount * remaining) / daysInMonth);
}
