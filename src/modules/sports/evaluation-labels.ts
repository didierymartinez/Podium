/** Textos de evaluaciones para componentes de cliente (sin acceso a la base de datos). */
export const EVALUATION_STATUS: Record<
  "NOT_PASSED" | "PROPOSED" | "APPROVED" | "REJECTED",
  { label: string; tone: "neutral" | "sun" | "mint" | "danger" }
> = {
  NOT_PASSED: { label: "Sigue en el nivel", tone: "neutral" },
  PROPOSED: { label: "Propuesta de promoción", tone: "sun" },
  APPROVED: { label: "Promovido", tone: "mint" },
  REJECTED: { label: "Promoción no aprobada", tone: "danger" },
};

export const SCORE_LABELS = ["", "Inicial", "En proceso", "Logrado", "Destacado", "Excelente"] as const;

export const formatAverage = (value: number) => value.toFixed(1).replace(".", ",");

export const PROMOTION_HINT = "para subir de nivel: todos los criterios en 3 o más y promedio de 3,5";
