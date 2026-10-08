/** Pesos colombianos como enteros (sin centavos). */

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** 180000 → "$ 180.000" */
export function formatCOP(amount: number): string {
  return copFormatter.format(amount).replace(/ /g, " ");
}

/** "$ 180.000", "180000", "180.000,00" → 180000. Devuelve null si no hay número válido. */
export function parseCOP(input: string): number | null {
  const withoutCents = input.trim().replace(/,\d{1,2}$/, "");
  const digits = withoutCents.replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}
