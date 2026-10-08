/** Línea de progresión en SVG, sin librerías; incluye una tabla oculta para lectores de pantalla. */
export function LineChart({
  title,
  points,
  format,
  invert = false,
  target,
}: {
  title: string;
  points: { label: string; value: number }[];
  format: (n: number) => string;
  /** Menor es mejor: la línea sube cuando mejora. */
  invert?: boolean;
  target?: number | null;
}) {
  const values = [...points.map((p) => p.value), ...(target ? [target] : [])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 100;
  const h = 40;
  const x = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => {
    const t = (v - min) / span;
    return 4 + (invert ? t : 1 - t) * (h - 8);
  };
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ");
  return (
    <figure>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-24 w-full overflow-visible"
        aria-hidden
      >
        {target != null && (
          <line
            x1="0"
            x2={w}
            y1={y(target)}
            y2={y(target)}
            className="stroke-mint"
            strokeDasharray="2 2"
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={path}
          fill="none"
          className="stroke-brand"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r="1.6" className="fill-brand">
            <title>{`${p.label}: ${format(p.value)}`}</title>
          </circle>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <th>{p.label}</th>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
