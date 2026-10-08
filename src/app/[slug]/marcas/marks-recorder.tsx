"use client";

import { Flag, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Button, Card, Field, Input, SectionTitle, Select } from "@/components/ui";
import {
  CONTEXT_LABELS,
  TIMING_LABELS,
  formatPerformance,
  parsePerformance,
  type TestKind,
} from "@/modules/sports/format";
import { recordPerformancesAction } from "./actions";

type Test = { id: string; name: string; kind: TestKind; unit: string; disciplineId: string | null };

export function MarksRecorder({
  slug,
  today,
  groups,
  rosters,
  tests,
}: {
  slug: string;
  today: string;
  groups: { id: string; name: string; disciplineId: string }[];
  rosters: Record<string, { id: string; name: string }[]>;
  tests: Test[];
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const group = groups.find((g) => g.id === groupId);
  const available = tests.filter((t) => !t.disciplineId || t.disciplineId === group?.disciplineId);
  const [testId, setTestId] = useState(available[0]?.id ?? "");
  const test = available.find((t) => t.id === testId) ?? available[0];
  const [date, setDate] = useState(today);
  const [context, setContext] = useState<keyof typeof CONTEXT_LABELS>("TRAINING");
  const [timing, setTiming] = useState<keyof typeof TIMING_LABELS>("MANUAL");
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  // Cronómetro: arranca con un toque y cada alumno registra su tiempo al pasar la meta.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => {
      setElapsed((performance.now() - startedAt) / 1000);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [startedAt]);

  const athletes = rosters[groupId] ?? [];
  if (groups.length === 0)
    return <Card className="text-sm text-ink-soft">No tienes grupos activos para registrar marcas.</Card>;

  function save() {
    if (!test) return;
    const entries = athletes.flatMap((a) => {
      const value = parsePerformance(test.kind, values[a.id] ?? "");
      return value ? [{ athleteId: a.id, value }] : [];
    });
    const invalid = athletes.filter(
      (a) => values[a.id]?.trim() && !parsePerformance(test.kind, values[a.id]),
    );
    if (invalid.length) {
      setResult({ tone: "danger", text: `Revisa la marca de ${invalid.map((a) => a.name).join(", ")}.` });
      return;
    }
    if (entries.length === 0) {
      setResult({ tone: "danger", text: "Escribe al menos una marca." });
      return;
    }
    start(async () => {
      const r = await recordPerformancesAction(slug, {
        testId: test.id,
        recordedOn: date,
        context,
        timing: test.kind === "TIME" ? timing : null,
        entries,
      });
      if (!r.ok) {
        setResult({ tone: "danger", text: "No se pudieron guardar las marcas. Revisa los datos." });
        return;
      }
      setValues({});
      setStartedAt(null);
      setElapsed(0);
      setResult({
        tone: "info",
        text:
          `${r.saved} marcas guardadas.` +
          (r.personalBests.length
            ? ` ¡Nuevas mejores marcas: ${r.personalBests.map((p) => `${p.name} (${p.value})`).join(", ")}!`
            : ""),
      });
    });
  }

  return (
    <Card>
      <SectionTitle>Registrar marcas</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Grupo">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prueba">
          <Select value={test?.id ?? ""} onChange={(e) => setTestId(e.target.value)}>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha">
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Contexto">
          <Select value={context} onChange={(e) => setContext(e.target.value as typeof context)}>
            {Object.entries(CONTEXT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {test?.kind === "TIME" && (
          <Field label="Cronometraje">
            <Select value={timing} onChange={(e) => setTiming(e.target.value as typeof timing)}>
              {Object.entries(TIMING_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {test?.kind === "TIME" && (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-canvas p-3"
          aria-label="Cronómetro"
        >
          <span className="min-w-28 font-mono text-3xl font-semibold tabular-nums" role="timer">
            {elapsed.toFixed(2).replace(".", ",")}
          </span>
          {startedAt === null ? (
            <Button onClick={() => setStartedAt(performance.now() - elapsed * 1000)}>
              <Play className="size-4" /> {elapsed ? "Continuar" : "Iniciar"}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStartedAt(null)}>
              <Square className="size-4" /> Detener
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setStartedAt(null);
              setElapsed(0);
            }}
          >
            <RotateCcw className="size-4" /> Reiniciar
          </Button>
          <span className="text-xs text-ink-soft">
            Toca &quot;Llegó&quot; en cada alumno al pasar la meta.
          </span>
        </div>
      )}

      <ul className="mt-3 divide-y divide-line" aria-label="Marcas por alumno">
        {athletes.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="flex-1 font-semibold">{a.name}</span>
            {test?.kind === "TIME" && startedAt !== null && (
              <Button
                variant="secondary"
                className="h-9"
                aria-label={`Llegó ${a.name}`}
                onClick={() => setValues((v) => ({ ...v, [a.id]: elapsed.toFixed(2).replace(".", ",") }))}
              >
                <Flag className="size-4" /> Llegó
              </Button>
            )}
            <Input
              aria-label={`Marca de ${a.name}`}
              placeholder={test?.kind === "TIME" ? "45,32 o 1:02,35" : test?.unit}
              value={values[a.id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))}
              className="h-10 w-36"
              inputMode="decimal"
            />
            {test && values[a.id] && parsePerformance(test.kind, values[a.id]) && (
              <span className="w-20 text-xs text-ink-soft">
                {formatPerformance(test.kind, test.unit, parsePerformance(test.kind, values[a.id])!)}
              </span>
            )}
          </li>
        ))}
        {athletes.length === 0 && (
          <li className="py-2 text-sm text-ink-soft">El grupo no tiene alumnos activos.</li>
        )}
      </ul>
      {result && (
        <div className="mt-3">
          <Alert tone={result.tone}>{result.text}</Alert>
        </div>
      )}
      <div className="mt-3">
        <Button onClick={save} disabled={pending || !test}>
          {pending ? "Guardando…" : "Guardar marcas"}
        </Button>
      </div>
    </Card>
  );
}
