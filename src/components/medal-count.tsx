import { MEDAL_LABELS, MEDALS, type Medal } from "@/modules/competitions/labels";

const MEDAL_COLORS: Record<Medal, string> = { GOLD: "#e5b400", SILVER: "#9aa3ad", BRONZE: "#c07a3e" };

/** Conteo de medallas con su color ("● 2 oro · ● 1 plata…"). */
export function MedalCount({ medals }: { medals: Record<Medal, number> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-3 tabular-nums">
      {MEDALS.map((m) => (
        <span key={m} className="inline-flex items-center gap-1" title={MEDAL_LABELS[m]}>
          <span className="size-3 rounded-full" style={{ background: MEDAL_COLORS[m] }} aria-hidden />
          {medals[m]} {MEDAL_LABELS[m].toLowerCase()}
        </span>
      ))}
    </span>
  );
}

export function MedalDot({ medal }: { medal: Medal }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <span className="size-3 rounded-full" style={{ background: MEDAL_COLORS[medal] }} aria-hidden />
      {MEDAL_LABELS[medal]}
    </span>
  );
}
