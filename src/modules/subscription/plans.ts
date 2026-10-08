/**
 * Planes de Podium por alumnos activos (#21). PRECIOS PROVISIONALES: el dueño los confirma en el issue #21;
 * cambiar aquí basta (las cuentas ya emitidas conservan su valor).
 */
export type PlanCode = "semilla" | "club" | "academia" | "elite";
export type Interval = "MONTHLY" | "ANNUAL";

export type Plan = { code: PlanCode; name: string; maxAthletes: number | null; monthly: number };

export const PLANS: Plan[] = [
  { code: "semilla", name: "Semilla", maxAthletes: 50, monthly: 89_000 },
  { code: "club", name: "Club", maxAthletes: 150, monthly: 179_000 },
  { code: "academia", name: "Academia", maxAthletes: 400, monthly: 299_000 },
  { code: "elite", name: "Élite", maxAthletes: null, monthly: 449_000 },
];

/** El anual equivale a 10 mensualidades (2 meses gratis). */
export const ANNUAL_MONTHS = 10;

export const isPlanCode = (code: string): code is PlanCode => PLANS.some((p) => p.code === code);
export const planOf = (code: string) => PLANS.find((p) => p.code === code) ?? null;

/** Plan más pequeño que alcanza para los alumnos activos. */
export function planFor(activeAthletes: number): Plan {
  return PLANS.find((p) => p.maxAthletes === null || activeAthletes <= p.maxAthletes)!;
}

export const exceedsPlan = (plan: Plan, activeAthletes: number) =>
  plan.maxAthletes !== null && activeAthletes > plan.maxAthletes;

/** Valor a cobrar del periodo, con el descuento vigente (cupón de la consola de Podium). */
export function priceOf(plan: Plan, interval: Interval, discountPercent = 0) {
  const base = interval === "ANNUAL" ? plan.monthly * ANNUAL_MONTHS : plan.monthly;
  return Math.round((base * (100 - Math.min(100, Math.max(0, discountPercent)))) / 100);
}

/** Ingreso mensual recurrente equivalente (para el MRR de la consola). */
export const monthlyRevenue = (plan: Plan, interval: Interval, discountPercent = 0) =>
  Math.round(priceOf(plan, interval, discountPercent) / (interval === "ANNUAL" ? 12 : 1));

export const INTERVAL_LABELS: Record<Interval, string> = { MONTHLY: "Mensual", ANNUAL: "Anual" };
