import { isIsoDate, todayIn } from "@/lib/dates";
import type { Range } from "@/modules/reports/reports";

/** Rango de fechas de los filtros (?desde=&hasta=); por defecto el mes en curso hasta hoy. */
export function readRange(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  timeZone: string,
) {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]);
  const today = todayIn(timeZone);
  const desde = get("desde");
  const hasta = get("hasta");
  let range: Range = {
    from: isIsoDate(desde) ? desde : `${today.slice(0, 7)}-01`,
    to: isIsoDate(hasta) ? hasta : today,
  };
  if (range.from > range.to) range = { from: range.to, to: range.from };
  return { range, today };
}
