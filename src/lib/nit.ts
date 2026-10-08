/** Dígito de verificación del NIT (algoritmo DIAN, módulo 11). */
const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function nitCheckDigit(base: string): number {
  const digits = base.split("").reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * WEIGHTS[i], 0);
  const mod = sum % 11;
  return mod > 1 ? 11 - mod : mod;
}

/**
 * Normaliza "901.234.567-8" → "901234567-8" si el dígito de verificación es correcto.
 * Si viene sin dígito de verificación ("901234567"), lo calcula.
 */
export function normalizeNit(input: string): string | null {
  const match = input.replace(/[\s.]/g, "").match(/^(\d{6,15})(?:-(\d))?$/);
  if (!match) return null;
  const [, base, dv] = match;
  const expected = nitCheckDigit(base);
  if (dv !== undefined && Number(dv) !== expected) return null;
  return `${base}-${expected}`;
}
