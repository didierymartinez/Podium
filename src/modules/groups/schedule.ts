import { z } from "zod";

export const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const WEEKDAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const scheduleSlotSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(TIME_RE, "Hora inválida"),
    endTime: z.string().regex(TIME_RE, "Hora inválida"),
  })
  .refine((s) => s.endTime > s.startTime, { message: "La hora de fin debe ser después del inicio" });

export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;

export const scheduleSchema = z
  .array(scheduleSlotSchema)
  .min(1, "Agrega al menos un día de clase")
  .max(14)
  .superRefine((slots, ctx) => {
    const sorted = [...slots].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev.weekday === cur.weekday && cur.startTime < prev.endTime) {
        ctx.addIssue({
          code: "custom",
          message: `Hay horarios que se cruzan el ${WEEKDAYS[cur.weekday].toLowerCase()}`,
        });
        return;
      }
    }
  });

/** Postgres devuelve "16:00:00"; mostramos "16:00". */
export const hhmm = (time: string) => time.slice(0, 5);

/** "16:00" → "4:00 p. m." */
export function formatTime(time: string): string {
  const [h, m] = hhmm(time).split(":").map(Number);
  const suffix = h < 12 ? "a. m." : "p. m.";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Resumen legible: "Lun, Mié y Vie · 4:00 p. m. – 6:00 p. m.".
 * Agrupa los días que comparten el mismo horario.
 */
export function describeSchedule(slots: ScheduleSlot[]): string {
  const byTime = new Map<string, number[]>();
  for (const s of [...slots].sort((a, b) => a.weekday - b.weekday)) {
    const key = `${hhmm(s.startTime)}-${hhmm(s.endTime)}`;
    byTime.set(key, [...(byTime.get(key) ?? []), s.weekday]);
  }
  return [...byTime.entries()]
    .map(([key, days]) => {
      const [start, end] = key.split("-");
      const names = days.map((d) => WEEKDAYS_SHORT[d]);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}` : names[0];
      return `${list} · ${formatTime(start)} – ${formatTime(end)}`;
    })
    .join(" / ");
}

/** Minutos de clase por semana (para mostrar intensidad del grupo). */
export function weeklyMinutes(slots: ScheduleSlot[]): number {
  const minutes = (t: string) => {
    const [h, m] = hhmm(t).split(":").map(Number);
    return h * 60 + m;
  };
  return slots.reduce((sum, s) => sum + minutes(s.endTime) - minutes(s.startTime), 0);
}

/** Rango compacto para celdas pequeñas: "4–6pm", "8–11am", "11am–1pm", "4:30–6pm". */
export function shortTimeRange(start: string, end: string): string {
  const part = (time: string) => {
    const [h, m] = hhmm(time).split(":").map(Number);
    const hour = h % 12 === 0 ? 12 : h % 12;
    return { text: m ? `${hour}:${String(m).padStart(2, "0")}` : String(hour), suffix: h < 12 ? "am" : "pm" };
  };
  const a = part(start);
  const b = part(end);
  return a.suffix === b.suffix
    ? `${a.text}–${b.text}${b.suffix}`
    : `${a.text}${a.suffix}–${b.text}${b.suffix}`;
}
