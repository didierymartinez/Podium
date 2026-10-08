import { addDays, type IsoDate } from "@/lib/dates";

const pad = (n: number) => String(n).padStart(2, "0");

/** Próxima fecha (hoy o después) en que se generan las mensualidades. `generationDay` va de 1 a 28. */
export function nextGenerationDate(today: IsoDate, generationDay: number): IsoDate {
  const [y, m, d] = today.split("-").map(Number);
  if (d <= generationDay) return `${y}-${pad(m)}-${pad(generationDay)}`;
  const nextMonth = addDays(`${y}-${pad(m)}-28`, 4).slice(0, 7); // día 28 + 4 siempre cae en el mes siguiente
  return `${nextMonth}-${pad(generationDay)}`;
}
