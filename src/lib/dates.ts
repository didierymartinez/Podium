/** Utilidades de fecha en la zona horaria de la escuela (Colombia por defecto). */

export type IsoDate = string; // "2026-10-08"

export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo. */
export function weekdayIndex(date: IsoDate): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -weekdayIndex(date));
}

export function dateRange(start: IsoDate, count: number): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", ...options });

export const formatWeekdayShort = (date: IsoDate) =>
  formatter({ weekday: "short" }).format(toUtc(date)).replace(".", "");
export const formatDayNumber = (date: IsoDate) => String(toUtc(date).getUTCDate());
export const formatLongDate = (date: IsoDate) =>
  formatter({ day: "numeric", month: "long", year: "numeric" }).format(toUtc(date));

/** Fecha ISO de un instante en una zona horaria. */
export function isoDateOf(instant: Date, timeZone: string): IsoDate {
  return todayIn(timeZone, instant);
}
