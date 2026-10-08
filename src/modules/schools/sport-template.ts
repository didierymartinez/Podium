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

export type TestTemplate = {
  name: string;
  kind: "TIME" | "DISTANCE" | "POINTS" | "REPS" | "SCORE" | "POSITION";
  unit: string;
  lowerIsBetter: boolean;
  context: "TRACK" | "ROAD" | "FIELD";
  /** Sin modalidad: pruebas físicas comunes. */
  common?: boolean;
};

/** Pruebas de la plantilla de velocidad (§2.3); las físicas sirven para todas las modalidades. */
export const SPEED_TESTS: TestTemplate[] = [
  { name: "200 m contrarreloj", kind: "TIME", unit: "s", lowerIsBetter: true, context: "TRACK" },
  { name: "500 m sprint", kind: "TIME", unit: "s", lowerIsBetter: true, context: "TRACK" },
  { name: "1.000 m", kind: "TIME", unit: "s", lowerIsBetter: true, context: "TRACK" },
  { name: "10.000 m puntos", kind: "POINTS", unit: "pts", lowerIsBetter: false, context: "TRACK" },
  { name: "10.000 m eliminación", kind: "POSITION", unit: "puesto", lowerIsBetter: true, context: "TRACK" },
  { name: "15.000 m eliminación", kind: "POSITION", unit: "puesto", lowerIsBetter: true, context: "TRACK" },
  { name: "100 m ruta", kind: "TIME", unit: "s", lowerIsBetter: true, context: "ROAD" },
  { name: "200 m ruta", kind: "TIME", unit: "s", lowerIsBetter: true, context: "ROAD" },
  { name: "Una vuelta", kind: "TIME", unit: "s", lowerIsBetter: true, context: "ROAD" },
  { name: "5.000 m ruta", kind: "TIME", unit: "s", lowerIsBetter: true, context: "ROAD" },
  { name: "Media maratón", kind: "TIME", unit: "s", lowerIsBetter: true, context: "ROAD" },
  { name: "Maratón", kind: "TIME", unit: "s", lowerIsBetter: true, context: "ROAD" },
  { name: "30 m lanzados", kind: "TIME", unit: "s", lowerIsBetter: true, context: "FIELD", common: true },
  {
    name: "Salto horizontal",
    kind: "DISTANCE",
    unit: "cm",
    lowerIsBetter: false,
    context: "FIELD",
    common: true,
  },
  {
    name: "Salto vertical",
    kind: "DISTANCE",
    unit: "cm",
    lowerIsBetter: false,
    context: "FIELD",
    common: true,
  },
  {
    name: "Flexibilidad (sit and reach)",
    kind: "DISTANCE",
    unit: "cm",
    lowerIsBetter: false,
    context: "FIELD",
    common: true,
  },
  {
    name: "Test de Cooper",
    kind: "DISTANCE",
    unit: "m",
    lowerIsBetter: false,
    context: "FIELD",
    common: true,
  },
  {
    name: "Abdominales en 1 min",
    kind: "REPS",
    unit: "reps",
    lowerIsBetter: false,
    context: "FIELD",
    common: true,
  },
];

export const testsFor = (code: DisciplineCode): TestTemplate[] =>
  code === "speed" ? SPEED_TESTS : SPEED_TESTS.filter((t) => t.common);

/** Rúbrica de cada nivel (§2.1): criterios que se califican de 1 a 5. */
const SPEED_CRITERIA: Record<string, string[]> = {
  Iniciación: [
    "Posición básica",
    "Desplazamiento hacia adelante",
    'Frenado en "T"',
    "Caída segura y levantarse",
  ],
  Formación: [
    "Empuje lateral completo",
    "Cruce en curva (ambos lados)",
    'Frenado en "T" a velocidad',
    "Desplazamiento hacia atrás",
  ],
  Intermedio: ["Salida", "Posición aerodinámica sostenida", "Curva a velocidad", "Relevos en grupo"],
  Avanzado: ["Doble empuje", "Sprints", "Lectura de carrera", "1.000 m bajo el tiempo objetivo"],
  Competencia: ["Marcas mínimas de su categoría", "Participación en el calendario de liga"],
};
const GENERIC_CRITERIA = ["Técnica básica de la modalidad", "Control y equilibrio", "Actitud y disciplina"];

export function criteriaFor(code: DisciplineCode, levelName: string): string[] {
  return code === "speed" ? (SPEED_CRITERIA[levelName] ?? GENERIC_CRITERIA) : GENERIC_CRITERIA;
}
