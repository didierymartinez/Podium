/**
 * Plantillas por deporte que se copian (editables) a cada escuela: modalidades, niveles, categorías, pruebas y
 * rúbricas. Patinaje es el deporte base; natación es el segundo deporte (#71) y valida que agregar otro sea
 * solo una plantilla. Las categorías son un ejemplo: cada escuela debe ajustarlas al reglamento de su liga.
 */

export type Sport = "SKATING" | "SWIMMING" | "FITNESS";

export const SPORT_LABELS: Record<Sport, string> = {
  SKATING: "Patinaje",
  SWIMMING: "Natación",
  FITNESS: "Gimnasio",
};

export const SKATING_DISCIPLINES = [
  { code: "speed", name: "Velocidad", sport: "SKATING" },
  { code: "artistic", name: "Artístico", sport: "SKATING" },
  { code: "hockey", name: "Hockey", sport: "SKATING" },
  { code: "freestyle", name: "Freestyle", sport: "SKATING" },
] as const;

export const SWIMMING_DISCIPLINES = [
  { code: "swim", name: "Formativa", sport: "SWIMMING" },
  { code: "swim-comp", name: "Competitiva", sport: "SWIMMING" },
] as const;

/** Vertical gimnasio (#74): entrenamiento personal y funcional. */
export const FITNESS_DISCIPLINES = [
  { code: "fitness", name: "Entrenamiento personal", sport: "FITNESS" },
] as const;

/** Todas las modalidades disponibles, de todos los deportes. */
export const ALL_DISCIPLINES = [
  ...SKATING_DISCIPLINES,
  ...SWIMMING_DISCIPLINES,
  ...FITNESS_DISCIPLINES,
] as const;

export type DisciplineCode = (typeof ALL_DISCIPLINES)[number]["code"];

export const DISCIPLINE_CODES = ALL_DISCIPLINES.map((d) => d.code) as [DisciplineCode, ...DisciplineCode[]];

export const sportOf = (code: string): Sport =>
  ALL_DISCIPLINES.find((d) => d.code === code)?.sport ?? "SKATING";

/** "Patinaje · Velocidad", "Natación · Formativa". */
export const disciplineLabel = (sport: string, name: string) =>
  `${SPORT_LABELS[(sport as Sport) in SPORT_LABELS ? (sport as Sport) : "SKATING"]} · ${name}`;

export type LevelTemplate = { name: string; goal: string };

const SPEED_LEVELS: LevelTemplate[] = [
  { name: "Iniciación", goal: "Dominio básico del patín" },
  { name: "Formación", goal: "Técnica fundamental" },
  { name: "Intermedio", goal: "Técnica aplicada a velocidad" },
  { name: "Avanzado", goal: "Táctica y resistencia" },
  { name: "Competencia", goal: "Rendimiento federado" },
];

const SWIMMING_LEVELS: LevelTemplate[] = [
  { name: "Adaptación", goal: "Familiarización con el agua, respiración y flotación" },
  { name: "Desplazamiento", goal: "Patada y brazada básicas, nado sin apoyo" },
  { name: "Estilos", goal: "Libre y espalda completos; iniciación en pecho y mariposa" },
  { name: "Perfeccionamiento", goal: "Cuatro estilos, salidas y vueltas" },
  { name: "Competencia", goal: "Rendimiento federado" },
];

const GENERIC_LEVELS: LevelTemplate[] = [
  { name: "Iniciación", goal: "Dominio básico del patín" },
  { name: "Formación", goal: "Técnica fundamental de la modalidad" },
  { name: "Intermedio", goal: "Técnica aplicada" },
  { name: "Avanzado", goal: "Perfeccionamiento" },
  { name: "Competencia", goal: "Rendimiento federado" },
];

const FITNESS_LEVELS: LevelTemplate[] = [
  { name: "Principiante", goal: "Técnica de los movimientos básicos y hábito" },
  { name: "Intermedio", goal: "Progresión de cargas y acondicionamiento" },
  { name: "Avanzado", goal: "Rendimiento y objetivos específicos" },
];

export function levelsFor(code: DisciplineCode): LevelTemplate[] {
  if (sportOf(code) === "SWIMMING") return SWIMMING_LEVELS;
  if (sportOf(code) === "FITNESS") return FITNESS_LEVELS;
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

/** Categorías de natación por edad (ejemplo; ajustar al reglamento de la liga). */
export const SWIMMING_AGE_CATEGORIES: AgeCategoryTemplate[] = [
  { name: "Preinfantil", minAge: null, maxAge: 8 },
  { name: "Infantil A", minAge: 9, maxAge: 10 },
  { name: "Infantil B", minAge: 11, maxAge: 12 },
  { name: "Juvenil A", minAge: 13, maxAge: 14 },
  { name: "Juvenil B", minAge: 15, maxAge: 17 },
  { name: "Mayores", minAge: 18, maxAge: 24 },
  { name: "Máster", minAge: 25, maxAge: null },
];

/** Gimnasio: grupos de edad amplios (no hay categorías federadas). */
export const FITNESS_AGE_CATEGORIES: AgeCategoryTemplate[] = [
  { name: "Menores", minAge: null, maxAge: 17 },
  { name: "Adultos", minAge: 18, maxAge: 59 },
  { name: "Mayores de 60", minAge: 60, maxAge: null },
];

export const ageCategoriesFor = (sport: Sport) =>
  sport === "SWIMMING"
    ? SWIMMING_AGE_CATEGORIES
    : sport === "FITNESS"
      ? FITNESS_AGE_CATEGORIES
      : SKATING_AGE_CATEGORIES;

export type TestTemplate = {
  name: string;
  kind: "TIME" | "DISTANCE" | "POINTS" | "REPS" | "SCORE" | "POSITION";
  unit: string;
  lowerIsBetter: boolean;
  context: "TRACK" | "ROAD" | "FIELD" | "POOL";
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

const pool = (name: string): TestTemplate => ({
  name,
  kind: "TIME",
  unit: "s",
  lowerIsBetter: true,
  context: "POOL",
});

/** Pruebas de piscina (25 m o 50 m) por estilo. */
export const SWIMMING_TESTS: TestTemplate[] = [
  pool("25 m libre"),
  pool("50 m libre"),
  pool("100 m libre"),
  pool("200 m libre"),
  pool("50 m espalda"),
  pool("50 m pecho"),
  pool("50 m mariposa"),
  pool("100 m combinado"),
  pool("200 m combinado"),
];

export function testsFor(code: DisciplineCode): TestTemplate[] {
  const common = SPEED_TESTS.filter((t) => t.common);
  if (sportOf(code) === "SWIMMING") return [...SWIMMING_TESTS, ...common];
  if (sportOf(code) === "FITNESS") return common;
  return code === "speed" ? SPEED_TESTS : common;
}

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

const SWIMMING_CRITERIA: Record<string, string[]> = {
  Adaptación: ["Inmersión y respiración", "Flotación ventral y dorsal", "Confianza en el agua"],
  Desplazamiento: ["Patada de libre", "Brazada con respiración lateral", "Nado de 12,5 m sin apoyo"],
  Estilos: ["Libre completo", "Espalda completo", "Patada de pecho", "Ondulación de mariposa"],
  Perfeccionamiento: ["Cuatro estilos", "Salida desde el bloque", "Vuelta de campana", "Ritmo de nado"],
  Competencia: ["Marcas mínimas de su categoría", "Participación en el calendario de liga"],
};

const FITNESS_CRITERIA = ["Técnica de los movimientos básicos", "Constancia", "Progresión de cargas"];

export function criteriaFor(code: DisciplineCode, levelName: string): string[] {
  if (sportOf(code) === "FITNESS") return FITNESS_CRITERIA;
  if (sportOf(code) === "SWIMMING") return SWIMMING_CRITERIA[levelName] ?? GENERIC_CRITERIA;
  return code === "speed" ? (SPEED_CRITERIA[levelName] ?? GENERIC_CRITERIA) : GENERIC_CRITERIA;
}
