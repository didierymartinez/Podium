/** Lectura y formato de marcas (sin dependencias de servidor: se usa en el navegador). */
export type TestKind = "TIME" | "DISTANCE" | "POINTS" | "REPS" | "SCORE" | "POSITION";

/**
 * Convierte lo que escribe el profesor a número. Tiempos: "45,32", "45.32", "1:02,35" o "1:05:30" → segundos.
 * Devuelve null si no se entiende.
 */
export function parsePerformance(kind: TestKind, input: string): number | null {
  const text = input.trim().replace(/\s/g, "");
  if (!text) return null;
  if (kind === "TIME" && text.includes(":")) {
    const parts = text.split(":");
    if (parts.length > 3 || parts.some((p) => !/^\d+([.,]\d+)?$/.test(p))) return null;
    const nums = parts.map((p) => Number(p.replace(",", ".")));
    const seconds = nums.reduce((acc, n) => acc * 60 + n, 0);
    return seconds > 0 ? Math.round(seconds * 1000) / 1000 : null;
  }
  if (!/^\d+([.,]\d+)?$/.test(text)) return null;
  const n = Number(text.replace(",", "."));
  return n > 0 ? n : null;
}

const two = (n: number) => String(n).padStart(2, "0");

/** "45,32 s", "1:02,35", "1:05:30", "245 cm", "12 reps". */
export function formatPerformance(kind: TestKind, unit: string, value: number): string {
  if (kind === "TIME") {
    const decimals = Math.round(value * 1000) % 10 === 0 ? 2 : 3;
    if (value >= 3600) {
      const h = Math.floor(value / 3600);
      const m = Math.floor((value % 3600) / 60);
      return `${h}:${two(m)}:${two(Math.round(value % 60))}`;
    }
    if (value >= 60) {
      const m = Math.floor(value / 60);
      const s = (value % 60).toFixed(decimals).replace(".", ",");
      return `${m}:${s.padStart(decimals + 3, "0")}`;
    }
    return `${value.toFixed(decimals).replace(".", ",")} s`;
  }
  const n = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
  return `${n} ${unit}`;
}

export const isBetter = (a: number, b: number, lowerIsBetter: boolean) => (lowerIsBetter ? a < b : a > b);

/** % de avance hacia la marca objetivo (100 = la alcanzó). */
export function targetProgress(best: number, target: number, lowerIsBetter: boolean) {
  const pct = lowerIsBetter ? (target / best) * 100 : (best / target) * 100;
  return Math.min(100, Math.round(pct));
}

export const CONTEXT_LABELS = {
  TRAINING: "Entreno",
  CONTROL: "Control",
  COMPETITION: "Competencia",
} as const;
export const TIMING_LABELS = { MANUAL: "Manual", ELECTRONIC: "Electrónico" } as const;
