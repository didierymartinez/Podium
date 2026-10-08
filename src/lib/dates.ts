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
export const formatShortDate = (date: IsoDate) =>
  formatter({ day: "numeric", month: "short" }).format(toUtc(date)).replace(".", "");
/** "jueves 8 de octubre" */
export const formatDayTitle = (date: IsoDate) =>
  formatter({ weekday: "long", day: "numeric", month: "long" }).format(toUtc(date)).replace(",", "");

/** "24 dic – 6 ene" o una sola fecha si coinciden. */
export function formatDateSpan(start: IsoDate, end: IsoDate) {
  return start === end ? formatShortDate(start) : `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

export const isIsoDate = (value: unknown): value is IsoDate =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** Fecha ISO de un instante en una zona horaria. */
export function isoDateOf(instant: Date, timeZone: string): IsoDate {
  return todayIn(timeZone, instant);
}

/** Desfase de la zona horaria en una fecha, p. ej. "-05:00" para Bogotá. */
function offsetOf(date: IsoDate, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  const match = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : "+00:00";
}

/** Instante de una fecha y hora locales de la escuela ("2026-10-08", "18:00"). */
export function instantOf(date: IsoDate, time: string, timeZone: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00${offsetOf(date, timeZone)}`);
}

/** "2026-01-31" + 1 mes → "2026-02-28" (se ajusta al último día del mes). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
