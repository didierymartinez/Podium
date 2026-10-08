import { Trophy } from "lucide-react";
import { MedalDot } from "./medal-count";
import { Card, SectionTitle } from "./ui";
import type { Medal } from "@/modules/competitions/labels";

/** Historial competitivo del alumno (DEP-68). */
export function CompetitionHistory({
  title = "Historial competitivo",
  history,
}: {
  title?: string;
  history: {
    id: string;
    name: string;
    startsOn: string;
    city: string;
    results: {
      id: string;
      event: string;
      position: number | null;
      mark: string | null;
      medal: Medal | null;
    }[];
  }[];
}) {
  return (
    <Card aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-3 text-sm">
        {history.map((c) => (
          <li key={c.id}>
            <p className="flex items-center gap-1.5 font-semibold">
              <Trophy className="size-4 text-ink-soft" /> {c.name}
            </p>
            <p className="text-xs text-ink-soft">
              {c.startsOn}
              {c.city ? ` · ${c.city}` : ""}
            </p>
            <ul className="mt-1 space-y-0.5">
              {c.results.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">{r.event}</span>
                  {r.mark && <span className="tabular-nums">{r.mark}</span>}
                  {r.position && <span className="text-ink-soft">{r.position}.º</span>}
                  {r.medal && <MedalDot medal={r.medal} />}
                </li>
              ))}
              {c.results.length === 0 && <li className="text-ink-soft">Sin resultados registrados.</li>}
            </ul>
          </li>
        ))}
        {history.length === 0 && <li className="text-ink-soft">Aún no ha participado en competencias.</li>}
      </ul>
    </Card>
  );
}
