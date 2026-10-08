/** Textos de planificación para componentes de cliente (sin base de datos). */
export const COMPONENT_LABELS = {
  WARMUP: "Calentamiento",
  TECHNIQUE: "Técnica",
  PHYSICAL: "Físico",
  SPEED: "Velocidad",
  ENDURANCE: "Resistencia",
  TACTICS: "Táctica",
  GAME: "Juego",
  COOLDOWN: "Vuelta a la calma",
} as const;

export const PHASE_LABELS = {
  WARMUP: "Calentamiento",
  MAIN: "Parte principal",
  COOLDOWN: "Vuelta a la calma",
} as const;

export const FULFILLMENT_LABELS = { YES: "Sí", PARTIAL: "Parcial", NO: "No" } as const;

/** Fase sugerida para un ejercicio según su componente. */
export const phaseFor = (component: keyof typeof COMPONENT_LABELS) =>
  component === "WARMUP" ? "WARMUP" : component === "COOLDOWN" ? "COOLDOWN" : "MAIN";

export const PERIOD_KIND_LABELS = { MACRO: "Macrociclo", MESO: "Mesociclo" } as const;
export const PERIOD_PHASE_LABELS = {
  GENERAL_PREP: "Preparación general",
  SPECIFIC_PREP: "Preparación específica",
  COMPETITIVE: "Competitivo",
  TRANSITION: "Transición",
} as const;
