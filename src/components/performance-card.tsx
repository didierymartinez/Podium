import { Trophy } from "lucide-react";
import { formatPerformance, type TestKind } from "@/modules/sports/format";
import { LineChart } from "./line-chart";
import { Card, Chip, SectionTitle } from "./ui";

export type ProgressView = {
  testId: string;
  name: string;
  kind: TestKind;
  unit: string;
  lowerIsBetter: boolean;
  best: number;
  marks: { value: number; recordedOn: string }[];
  category: { name: string; average: number; best: number; athletes: number } | null;
  target: { value: number; progress: number } | null;
};

/** Rendimiento de un deportista: mejor marca, progresión, comparativo y objetivo (DEP-51 a DEP-54). */
export function PerformanceCard({ title = "Rendimiento", tests }: { title?: string; tests: ProgressView[] }) {
  return (
    <Card>
      <SectionTitle action={<Trophy className="size-4 text-sun" />}>{title}</SectionTitle>
      {tests.length === 0 ? (
        <p className="text-sm text-ink-soft">Aún no hay marcas registradas.</p>
      ) : (
        <ul className="space-y-4" aria-label={title}>
          {tests.map((t) => {
            const fmt = (v: number) => formatPerformance(t.kind, t.unit, v);
            return (
              <li key={t.testId} className="rounded-2xl bg-canvas p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-semibold">{t.name}</span>
                  <Chip tone="sun">Mejor marca {fmt(t.best)}</Chip>
                </div>
                {t.marks.length > 1 && (
                  <LineChart
                    title={`Progresión en ${t.name}`}
                    points={t.marks.map((m) => ({ label: m.recordedOn, value: m.value }))}
                    format={fmt}
                    invert={t.lowerIsBetter}
                    target={t.target?.value}
                  />
                )}
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-soft">
                  <span>{t.marks.length} marcas</span>
                  {t.category && t.category.athletes > 1 && (
                    <span>
                      Categoría {t.category.name}: promedio {fmt(t.category.average)} · mejor{" "}
                      {fmt(t.category.best)}
                    </span>
                  )}
                  {t.target && (
                    <span>
                      Objetivo {fmt(t.target.value)} · {t.target.progress} %
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function toProgressView(
  rows: {
    test: { id: string; name: string; kind: TestKind; unit: string; lowerIsBetter: boolean };
    best: number;
    marks: { value: number; recordedOn: string }[];
    category: ProgressView["category"];
    target: ProgressView["target"];
  }[],
  opts: { withCategory?: boolean } = {},
): ProgressView[] {
  return rows.map((r) => ({
    testId: r.test.id,
    name: r.test.name,
    kind: r.test.kind,
    unit: r.test.unit,
    lowerIsBetter: r.test.lowerIsBetter,
    best: r.best,
    marks: r.marks.map((m) => ({ value: m.value, recordedOn: m.recordedOn })),
    category: opts.withCategory === false ? null : r.category,
    target: r.target,
  }));
}
