import type { ReactNode } from "react";
import {
  dateRange,
  formatDayNumber,
  formatWeekdayShort,
  startOfWeek,
  weekdayIndex,
  type IsoDate,
} from "@/lib/dates";
import { cn } from "./ui";

export type BoardRow = { id: string; title: string; subtitle?: string; avatar: ReactNode };

/**
 * Tablero semanal estilo calendario (filas × días): hoy resaltado con línea punteada,
 * fines de semana con trama. Base de la vista de asistencia y de clases.
 */
export function WeekBoard({
  today,
  rows,
  days = 14,
  overlay,
}: {
  today: IsoDate;
  rows: BoardRow[];
  days?: number;
  overlay?: ReactNode;
}) {
  const dates = dateRange(startOfWeek(today), days);
  const columns = `minmax(170px, 200px) repeat(${days}, minmax(44px, 1fr))`;

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-1">
        <div className="relative grid min-w-[820px] gap-1.5" style={{ gridTemplateColumns: columns }}>
          <div className="self-end pb-1 text-sm font-semibold text-ink-soft">Nivel</div>
          {dates.map((date) => {
            const isToday = date === today;
            const weekend = weekdayIndex(date) >= 5;
            return (
              <div
                key={date}
                className={cn(
                  "rounded-xl px-1 py-1.5 text-center text-[11px] leading-tight",
                  isToday
                    ? "bg-brand text-white shadow-pill"
                    : weekend
                      ? "bg-muted text-ink-soft"
                      : "border border-line bg-surface text-ink-soft",
                )}
              >
                <span className="block capitalize">{formatWeekdayShort(date)}</span>
                <span className={cn("block text-sm font-semibold", !isToday && "text-ink")}>
                  {formatDayNumber(date)}
                </span>
              </div>
            );
          })}

          {rows.map((row) => (
            <Row key={row.id} row={row} dates={dates} today={today} />
          ))}
        </div>
      </div>
      {overlay && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center pt-12">{overlay}</div>
      )}
    </div>
  );
}

function Row({ row, dates, today }: { row: BoardRow; dates: IsoDate[]; today: IsoDate }) {
  return (
    <>
      <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-2.5 py-2">
        {row.avatar}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.title}</p>
          {row.subtitle && <p className="truncate text-xs text-ink-soft">{row.subtitle}</p>}
        </div>
      </div>
      {dates.map((date) => (
        <div
          key={date}
          className={cn(
            "relative h-14 rounded-xl border border-line/80",
            weekdayIndex(date) >= 5 ? "hatch bg-muted/60" : "bg-canvas",
          )}
        >
          {date === today && (
            <span
              className="absolute inset-y-[-4px] left-1/2 border-l-2 border-dashed border-brand/70"
              aria-hidden
            />
          )}
        </div>
      ))}
    </>
  );
}
