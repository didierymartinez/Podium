/**
 * Edad deportiva: año de la temporada − año de nacimiento (regla común de federaciones).
 * Se usa el año de la fecha ISO para no depender de la zona horaria.
 */
export function sportsAge(birthDate: string, seasonYear: number): number {
  const birthYear = Number(birthDate.slice(0, 4));
  if (!Number.isInteger(birthYear)) throw new Error(`Fecha de nacimiento inválida: ${birthDate}`);
  return seasonYear - birthYear;
}

export type AgeRange = { minAge: number | null; maxAge: number | null };

/** Primera categoría (en orden) cuyo rango contiene la edad. */
export function findAgeCategory<T extends AgeRange>(age: number, categories: T[]): T | undefined {
  return categories.find(
    (c) => (c.minAge === null || age >= c.minAge) && (c.maxAge === null || age <= c.maxAge),
  );
}
