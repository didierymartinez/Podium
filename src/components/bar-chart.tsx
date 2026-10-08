/** Gráfica de barras agrupadas en SVG, sin librerías. Incluye una tabla oculta para lectores de pantalla. */
export type BarSeries = { key: string; label: string; className: string };

export function BarChart({
  title,
  categories,
  series,
  values,
  format,
}: {
  title: string;
  categories: { key: string; label: string }[];
  series: BarSeries[];
  /** values[categoría][serie] */
  values: Record<string, Record<string, number>>;
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...categories.flatMap((c) => series.map((s) => values[c.key]?.[s.key] ?? 0)));
  const height = 140;
  const slot = 100 / categories.length;
  const bar = (slot * 0.7) / series.length;
  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 100 ${height + 18}`}
        preserveAspectRatio="none"
        className="h-48 w-full overflow-visible"
        aria-hidden
      >
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1="0"
            x2="100"
            y1={height - height * t}
            y2={height - height * t}
            className="stroke-line"
            strokeWidth="0.2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {categories.map((c, i) =>
          series.map((s, j) => {
            const v = values[c.key]?.[s.key] ?? 0;
            const h = (v / max) * height;
            return (
              <rect
                key={`${c.key}-${s.key}`}
                x={i * slot + slot * 0.15 + j * bar}
                y={height - h}
                width={bar * 0.9}
                height={Math.max(h, v > 0 ? 1 : 0)}
                rx="0.6"
                className={s.className}
              >
                <title>{`${c.label} · ${s.label}: ${format(v)}`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className="flex text-[11px] text-ink-soft" aria-hidden>
        {categories.map((c) => (
          <span key={c.key} className="flex-1 text-center">
            {c.label}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-3 text-xs text-ink-soft">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg className="size-2.5" viewBox="0 0 10 10" aria-hidden>
              <rect width="10" height="10" rx="2" className={s.className} />
            </svg>
            {s.label}
          </span>
        ))}
      </figcaption>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Mes</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.key}>
              <th>{c.label}</th>
              {series.map((s) => (
                <td key={s.key}>{format(values[c.key]?.[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
