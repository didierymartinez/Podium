import type { ChipTone } from "@/components/ui";

export const STATUS_CHIP: Record<string, { label: string; tone: ChipTone }> = {
  TRIAL: { label: "Prueba", tone: "brand" },
  ACTIVE: { label: "Activa", tone: "mint" },
  PAST_DUE: { label: "En mora", tone: "sun" },
  READ_ONLY: { label: "Solo lectura", tone: "danger" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
};
