/** Catálogo de insignias (§10), apto para componentes de cliente. */
export const BADGES = {
  STREAK: { emoji: "🔥", name: "Racha", rule: "10, 25 y 50 clases seguidas sin falta" },
  CENTURY: { emoji: "💯", name: "Centenario", rule: "100 asistencias" },
  LEVEL_UP: { emoji: "⬆️", name: "Subí de nivel", rule: "Promoción de nivel aprobada" },
  PERSONAL_BEST: { emoji: "⏱️", name: "Récord personal", rule: "Superar su mejor marca en una prueba" },
  FIRST_PODIUM: { emoji: "🏅", name: "Primer podio", rule: "Primera medalla en competencia" },
  ANNIVERSARY: { emoji: "🎂", name: "Aniversario", rule: "Cada año en la escuela" },
} as const;

export type BadgeCode = keyof typeof BADGES;
export const BADGE_CODES = Object.keys(BADGES) as BadgeCode[];
export const STREAK_STEPS = [10, 25, 50] as const;
