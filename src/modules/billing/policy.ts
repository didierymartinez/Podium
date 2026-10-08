import { z } from "zod";

/** Descuento o recargo: ninguno, porcentaje o valor fijo en pesos. */
export const adjustmentSchema = z
  .object({
    type: z.enum(["none", "percent", "fixed"]),
    value: z.number().int().min(0),
  })
  .refine((a) => a.type !== "percent" || a.value <= 100, {
    message: "El porcentaje debe estar entre 0 y 100",
  });

export type Adjustment = z.infer<typeof adjustmentSchema>;

const day = z.number().int().min(1).max(28);

/** Política de cobro de la escuela (ADM-04, ADM-05, ADM-06). */
export const billingPolicySchema = z
  .object({
    generationDay: day,
    dueDay: day,
    enrollmentFee: z.number().int().min(0),
    lateFee: adjustmentSchema,
    siblingDiscount: adjustmentSchema,
    earlyPayment: adjustmentSchema.and(z.object({ untilDay: day })),
    midMonthJoin: z.enum(["full", "prorated", "next_month"]),
    overdueAfterDays: z.number().int().min(0).max(90),
    invoicePrefix: z
      .string()
      .trim()
      .regex(/^[A-Z]{1,4}$/, "Usa de 1 a 4 letras mayúsculas"),
    receiptPrefix: z
      .string()
      .trim()
      .regex(/^[A-Z]{1,4}$/, "Usa de 1 a 4 letras mayúsculas"),
  })
  .refine((p) => p.dueDay >= p.generationDay, {
    message: "El vencimiento debe ser el mismo día de generación o después",
    path: ["dueDay"],
  })
  .refine((p) => p.earlyPayment.type === "none" || p.earlyPayment.untilDay <= p.dueDay, {
    message: "El pronto pago debe terminar antes o el mismo día del vencimiento",
    path: ["earlyPayment"],
  });

export type BillingPolicy = z.infer<typeof billingPolicySchema>;

export const DEFAULT_BILLING_POLICY: BillingPolicy = {
  generationDay: 1,
  dueDay: 10,
  enrollmentFee: 0,
  lateFee: { type: "none", value: 0 },
  siblingDiscount: { type: "none", value: 0 },
  earlyPayment: { type: "none", value: 0, untilDay: 5 },
  midMonthJoin: "full",
  overdueAfterDays: 0,
  invoicePrefix: "CC",
  receiptPrefix: "RC",
};

/** Lee la política guardada completando lo que falte con los valores por defecto. */
export function readBillingPolicy(stored: unknown): BillingPolicy {
  const merged = { ...DEFAULT_BILLING_POLICY, ...(stored as object) };
  const parsed = billingPolicySchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_BILLING_POLICY;
}
