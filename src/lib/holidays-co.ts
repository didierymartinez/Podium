import { addDays, weekdayIndex, type IsoDate } from "./dates";

/**
 * Festivos de Colombia (Ley 51 de 1983 "Ley Emiliani"). Solo de referencia en Podium:
 * muchas escuelas tienen clase en festivos, así que nunca se omiten clases automáticamente.
 */

export type Holiday = { date: IsoDate; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): IsoDate => `${y}-${pad(m)}-${pad(d)}`;

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

/** Traslada al lunes siguiente si no cae en lunes (Ley Emiliani). */
function nextMonday(date: IsoDate): IsoDate {
  const weekday = weekdayIndex(date); // 0 = lunes
  return weekday === 0 ? date : addDays(date, 7 - weekday);
}

export function colombianHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: iso(year, 1, 1), name: "Año Nuevo" },
    { date: nextMonday(iso(year, 1, 6)), name: "Reyes Magos" },
    { date: nextMonday(iso(year, 3, 19)), name: "San José" },
    { date: addDays(easter, -3), name: "Jueves Santo" },
    { date: addDays(easter, -2), name: "Viernes Santo" },
    { date: iso(year, 5, 1), name: "Día del Trabajo" },
    { date: addDays(easter, 43), name: "Ascensión del Señor" },
    { date: addDays(easter, 64), name: "Corpus Christi" },
    { date: addDays(easter, 71), name: "Sagrado Corazón" },
    { date: nextMonday(iso(year, 6, 29)), name: "San Pedro y San Pablo" },
    { date: iso(year, 7, 20), name: "Día de la Independencia" },
    { date: iso(year, 8, 7), name: "Batalla de Boyacá" },
    { date: nextMonday(iso(year, 8, 15)), name: "Asunción de la Virgen" },
    { date: nextMonday(iso(year, 10, 12)), name: "Día de la Raza" },
    { date: nextMonday(iso(year, 11, 1)), name: "Todos los Santos" },
    { date: nextMonday(iso(year, 11, 11)), name: "Independencia de Cartagena" },
    { date: iso(year, 12, 8), name: "Inmaculada Concepción" },
    { date: iso(year, 12, 25), name: "Navidad" },
  ];
  // Dos festivos pueden caer el mismo día (p. ej. 2025-06-30): se unen los nombres.
  const byDate = new Map<IsoDate, string>();
  for (const h of list) byDate.set(h.date, byDate.has(h.date) ? `${byDate.get(h.date)} y ${h.name}` : h.name);
  return [...byDate.entries()]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Festivos entre dos fechas (incluidas), como mapa fecha → nombre. */
export function holidaysBetween(from: IsoDate, to: IsoDate): Map<IsoDate, string> {
  const result = new Map<IsoDate, string>();
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const h of colombianHolidays(year)) if (h.date >= from && h.date <= to) result.set(h.date, h.name);
  }
  return result;
}
