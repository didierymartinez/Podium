"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Field, Input, cn } from "@/components/ui";
import { PROMOTION_HINT, SCORE_LABELS, formatAverage } from "@/modules/sports/evaluation-labels";
import { evaluateAction } from "./actions";

const textareaClass =
  "block w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

/** Rúbrica de 1 a 5 por criterio, fortalezas, aspectos a mejorar y comentario (DEP-40, DEP-41). */
export function EvaluationForm({
  slug,
  today,
  athlete,
  levelName,
  criteria,
}: {
  slug: string;
  today: string;
  athlete: { id: string; name: string };
  levelName: string;
  criteria: { id: string; name: string }[];
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [date, setDate] = useState(today);
  const [text, setText] = useState({ strengths: "", improvements: "", comment: "" });
  const [result, setResult] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const values = criteria.map((c) => scores[c.id]).filter(Boolean);
  const average = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

  function save() {
    if (values.length !== criteria.length) {
      setResult({ tone: "danger", text: "Califica todos los criterios." });
      return;
    }
    start(async () => {
      const r = await evaluateAction(slug, {
        athleteId: athlete.id,
        evaluatedOn: date,
        scores: criteria.map((c) => ({ criterionId: c.id, score: scores[c.id] })),
        ...text,
      });
      if (!r.ok) {
        setResult({
          tone: "danger",
          text:
            r.error === "not_allowed" || r.error === "forbidden"
              ? "No puedes evaluar a este alumno."
              : "No se pudo guardar la evaluación. Revisa los datos.",
        });
        return;
      }
      setScores({});
      setText({ strengths: "", improvements: "", comment: "" });
      setResult({
        tone: "info",
        text:
          `Evaluación guardada (promedio ${formatAverage(r.average)}).` +
          (r.status === "PROPOSED"
            ? " Cumple la regla: quedó como propuesta de promoción para la administración."
            : ` Sigue en ${levelName}; la familia verá el informe.`),
      });
    });
  }

  return (
    <div className="space-y-4" aria-label={`Evaluación de ${athlete.name}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <p className="font-semibold">{athlete.name}</p>
          <p className="text-sm text-ink-soft">
            Nivel {levelName} · {PROMOTION_HINT}
          </p>
        </div>
        <Field label="Fecha">
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <ul className="divide-y divide-line">
        {criteria.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-48 flex-1">{c.name}</span>
            <div role="radiogroup" aria-label={c.name} className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={scores[c.id] === n}
                  aria-label={`${n} · ${SCORE_LABELS[n]}`}
                  title={SCORE_LABELS[n]}
                  onClick={() => setScores((s) => ({ ...s, [c.id]: n }))}
                  className={cn(
                    "grid size-9 place-items-center rounded-full text-sm font-semibold transition",
                    scores[c.id] === n
                      ? n >= 3
                        ? "bg-brand text-white"
                        : "bg-danger text-white"
                      : "bg-muted text-ink-soft hover:bg-line",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {average !== null && (
        <p className="text-sm text-ink-soft" role="status">
          Promedio parcial: <span className="font-semibold text-ink">{formatAverage(average)}</span>
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Fortalezas">
          <textarea
            rows={3}
            maxLength={500}
            className={textareaClass}
            value={text.strengths}
            onChange={(e) => setText((t) => ({ ...t, strengths: e.target.value }))}
          />
        </Field>
        <Field label="Aspectos a mejorar">
          <textarea
            rows={3}
            maxLength={500}
            className={textareaClass}
            value={text.improvements}
            onChange={(e) => setText((t) => ({ ...t, improvements: e.target.value }))}
          />
        </Field>
        <Field label="Comentario para la familia">
          <textarea
            rows={3}
            maxLength={500}
            className={textareaClass}
            value={text.comment}
            onChange={(e) => setText((t) => ({ ...t, comment: e.target.value }))}
          />
        </Field>
      </div>
      {result && <Alert tone={result.tone}>{result.text}</Alert>}
      <Button onClick={save} disabled={pending}>
        Guardar evaluación
      </Button>
    </div>
  );
}
