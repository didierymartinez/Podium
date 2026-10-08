/**
 * Normaliza un celular colombiano a formato E.164 (+57XXXXXXXXXX).
 * Acepta "300 123 4567", "3001234567", "+57 300-123-4567", "573001234567".
 */
export function normalizeColombianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("57")) digits = digits.slice(2);
  if (digits.length !== 10 || !digits.startsWith("3")) return null;
  return `+57${digits}`;
}
