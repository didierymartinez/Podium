/**
 * Plantilla de patinaje que se copia (editable) a cada escuela nueva.
 * Las categorías son un ejemplo: cada escuela debe ajustarlas al reglamento vigente de su liga.
 */

export const SKATING_DISCIPLINES = [
  { code: "speed", name: "Velocidad" },
  { code: "artistic", name: "Artístico" },
  { code: "hockey", name: "Hockey" },
  { code: "freestyle", name: "Freestyle" },
] as const;

export type DisciplineCode = (typeof SKATING_DISCIPLINES)[number]["code"];

export const DISCIPLINE_CODES = SKATING_DISCIPLINES.map((d) => d.code) as [
  DisciplineCode,
  ...DisciplineCode[],
];

export type LevelTemplate = { name: string; goal: string };

const SPEED_LEVELS: LevelTemplate[] = [
  { name: "Iniciación", goal: "Dominio básico del patín" },
  { name: "Formación", goal: "Técnica fundamental" },
  { name: "Intermedio", goal: "Técnica aplicada a velocidad" },
  { name: "Avanzado", goal: "Táctica y resistencia" },
  { name: "Competencia", goal: "Rendimiento federado" },
];

const GENERIC_LEVELS: LevelTemplate[] = [
  { name: "Iniciación", goal: "Dominio básico del patín" },
  { name: "Formación", goal: "Técnica fundamental de la modalidad" },
  { name: "Intermedio", goal: "Técnica aplicada" },
  { name: "Avanzado", goal: "Perfeccionamiento" },
  { name: "Competencia", goal: "Rendimiento federado" },
];

export function levelsFor(code: DisciplineCode): LevelTemplate[] {
  return code === "speed" ? SPEED_LEVELS : GENERIC_LEVELS;
}

export type AgeCategoryTemplate = { name: string; minAge: number | null; maxAge: number | null };

export const SKATING_AGE_CATEGORIES: AgeCategoryTemplate[] = [
  { name: "Mini", minAge: null, maxAge: 9 },
  { name: "Infantil", minAge: 10, maxAge: 11 },
  { name: "Pre-juvenil", minAge: 12, maxAge: 13 },
  { name: "Juvenil", minAge: 14, maxAge: 15 },
  { name: "Junior", minAge: 16, maxAge: 18 },
  { name: "Mayores", minAge: 19, maxAge: 29 },
  { name: "Máster", minAge: 30, maxAge: null },
];
