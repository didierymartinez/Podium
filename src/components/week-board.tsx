import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { dateRange, formatDayNumber, formatWeekdayShort, startOfWeek, type IsoDate } from "@/lib/dates";
import { cn } from "./ui";

export type BoardEvent = {
  date: IsoDate;
  label: string;
  color: string;
  /** done: asistencia tomada · canceled: clase cancelada. */
  state?: "done" | "canceled";
  href?: string;
};
export type BoardRow = {
  id: string;
  title: string;
  subtitle?: string;
  avatar: ReactNode;
  events?: BoardEvent[];
};
/** Festivos (solo referencia) y días sin clase de la escuela. */
export type BoardMark = { kind: "holiday" | "closure"; label: string };

/**
 * Tablero semanal estilo calendario (filas × días): hoy resaltado con línea punteada,
 * días sin clase con trama y festivos marcados como referencia.
 */
export function WeekBoard({
  today,
  rows,
  days = 14,
  overlay,
  rowLabel = "Nivel",
  marks = new Map(),
}: {
  today: IsoDate;
  rows: BoardRow[];
  days?: number;
  overlay?: ReactNode;
  rowLabel?: string;
  marks?: Map<IsoDate, BoardMark>;
}) {
  const dates = dateRange(startOfWeek(today), days);
  const columns = `minmax(170px, 200px) repeat(${days}, minmax(44px, 1fr))`;

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-1">
        <div className="relative grid min-w-[820px] gap-1.5" style={{ gridTemplateColumns: columns }}>
          <div className="self-end pb-1 text-sm font-semibold text-ink-soft">{rowLabel}</div>
          {dates.map((date) => {
            const isToday = date === today;
            const mark = marks.get(date);
            return (
              <div
                key={date}
                title={
                  mark ? `${mark.kind === "holiday" ? "Festivo" : "Sin clase"}: ${mark.label}` : undefined
                }
                className={cn(
                  "relative rounded-xl px-1 py-1.5 text-center text-[11px] leading-tight",
                  isToday
                    ? "bg-brand text-white shadow-pill"
                    : mark?.kind === "closure"
                      ? "hatch bg-muted text-ink-soft"
                      : "border border-line bg-surface text-ink-soft",
                )}
              >
                <span className="block capitalize">{formatWeekdayShort(date)}</span>
                <span className={cn("block text-sm font-semibold", !isToday && "text-ink")}>
                  {formatDayNumber(date)}
                </span>
                {mark?.kind === "holiday" && (
                  <span
                    className="absolute right-1 top-1 size-1.5 rounded-full bg-sun ring-1 ring-surface"
                    aria-label={`Festivo: ${mark.label}`}
                  />
                )}
              </div>
            );
          })}

          {rows.map((row) => (
            <Row key={row.id} row={row} dates={dates} today={today} marks={marks} />
          ))}
        </div>
      </div>
      {marks.size > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-sun" aria-hidden /> Festivo (referencia, hay clase)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="hatch size-3 rounded bg-muted" aria-hidden /> Sin clase
          </span>
        </p>
      )}
      {overlay && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center pt-12">{overlay}</div>
      )}
    </div>
  );
}

function Row({
  row,
  dates,
  today,
  marks,
}: {
  row: BoardRow;
  dates: IsoDate[];
  today: IsoDate;
  marks: Map<IsoDate, BoardMark>;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-2.5 py-2">
        {row.avatar}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.title}</p>
          {row.subtitle && <p className="truncate text-xs text-ink-soft">{row.subtitle}</p>}
        </div>
      </div>
      {dates.map((date) => {
        const events = row.events?.filter((e) => e.date === date) ?? [];
        return (
          <div
            key={date}
            className={cn(
              "relative flex h-14 flex-col justify-center gap-0.5 rounded-xl border border-line/80 p-0.5",
              marks.get(date)?.kind === "closure" ? "hatch bg-muted/60" : "bg-canvas",
            )}
          >
            {date === today && (
              <span
                className="absolute inset-y-[-4px] left-1/2 border-l-2 border-dashed border-brand/70"
                aria-hidden
              />
            )}
            {events.map((e, i) => {
              const className = cn(
                "relative flex items-center justify-center gap-0.5 truncate rounded-lg px-1 py-1 text-center text-[10px] font-semibold leading-tight text-white shadow-pill",
                date < today && e.state !== "done" && "opacity-45",
                e.state === "canceled" && "line-through opacity-40",
              );
              const title = `${row.title} · ${e.label}${
                e.state === "done" ? " · asistencia tomada" : e.state === "canceled" ? " · cancelada" : ""
              }`;
              const content = (
                <>
                  {e.state === "done" && <Check className="size-3 shrink-0" aria-hidden />}
                  {e.label}
                </>
              );
              return e.href ? (
                <Link
                  key={i}
                  href={e.href}
                  className={className}
                  style={{ background: e.color }}
                  title={title}
                >
                  {content}
                </Link>
              ) : (
                <span key={i} className={className} style={{ background: e.color }} title={title}>
                  {content}
                </span>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
