/** Medidas corporales: etiquetas y formato para componentes de cliente. */
export const BODY_METRICS = [
  { key: "weightKg", label: "Peso", unit: "kg" },
  { key: "heightCm", label: "Talla", unit: "cm" },
  { key: "wingspanCm", label: "Envergadura", unit: "cm" },
  { key: "skeletalMuscleKg", label: "Masa muscular esquelética", unit: "kg" },
  { key: "bodyFatKg", label: "Masa grasa", unit: "kg" },
  { key: "bodyFatPercent", label: "Grasa corporal", unit: "%" },
  { key: "visceralFat", label: "Grasa visceral", unit: "nivel" },
  { key: "bodyWaterKg", label: "Agua corporal", unit: "kg" },
  { key: "basalMetabolismKcal", label: "Metabolismo basal", unit: "kcal" },
] as const;

export type BodyMetricKey = (typeof BODY_METRICS)[number]["key"];

export const formatMetric = (value: number, unit: string) =>
  `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })} ${unit}`;
