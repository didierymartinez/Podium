/** Textos de competencias para componentes de cliente (sin base de datos). */
export const COMPETITION_KINDS = ["LEAGUE", "FEDERATION", "INTERCLUB", "FESTIVAL", "INTERNAL"] as const;
export type CompetitionKind = (typeof COMPETITION_KINDS)[number];

export const KIND_LABELS: Record<CompetitionKind, string> = {
  LEAGUE: "Liga",
  FEDERATION: "Federación",
  INTERCLUB: "Interclubes",
  FESTIVAL: "Festival",
  INTERNAL: "Interno",
};

export const ENTRY_STATUS_LABELS = {
  INVITED: { label: "Convocado", tone: "sun" },
  ACCEPTED: { label: "Inscrito", tone: "mint" },
  DECLINED: { label: "No asiste", tone: "neutral" },
} as const;

export const MEDALS = ["GOLD", "SILVER", "BRONZE"] as const;
export type Medal = (typeof MEDALS)[number];
export const MEDAL_LABELS: Record<Medal, string> = { GOLD: "Oro", SILVER: "Plata", BRONZE: "Bronce" };

export const DEFAULT_AUTHORIZATION =
  "Autorizo la participación de mi hijo(a) en esta competencia y su traslado con el personal de la escuela. " +
  "Declaro que está en condiciones de salud para competir y que conozco los costos de inscripción y servicios elegidos.";

/** Medalla a partir del texto de Excel ("Oro", "plata", "3"…). */
export function parseMedal(value: string): Medal | null {
  const v = value.trim().toLowerCase();
  if (["oro", "gold", "1"].includes(v)) return "GOLD";
  if (["plata", "silver", "2"].includes(v)) return "SILVER";
  if (["bronce", "bronze", "3"].includes(v)) return "BRONZE";
  return null;
}
