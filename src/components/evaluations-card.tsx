import { Award } from "lucide-react";
import { Card, Chip, SectionTitle } from "./ui";
import { EVALUATION_STATUS, formatAverage } from "@/modules/sports/evaluation-labels";

type Evaluation = {
  id: string;
  evaluatedOn: string;
  levelName: string;
  average: number;
  status: keyof typeof EVALUATION_STATUS;
  strengths: string | null;
  improvements: string | null;
  comment: string | null;
  scores: { id: string; criterionName: string; score: number }[];
};

/** Nivel vigente, historial y evaluaciones con certificado (ficha del alumno y portal de familias). */
export function EvaluationsCard({
  slug,
  title = "Nivel y evaluaciones",
  current,
  history,
  evaluations,
}: {
  slug: string;
  title?: string;
  current: { name: string; discipline: string } | null;
  history: { since: string; levelName: string }[];
  evaluations: Evaluation[];
}) {
  return (
    <Card aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      <p className="text-sm">
        Nivel actual:{" "}
        <span className="font-semibold">
          {current ? `${current.name} (${current.discipline})` : "sin nivel asignado"}
        </span>
      </p>
      {history.length > 0 && (
        <p className="mt-1 text-xs text-ink-soft">
          Promociones: {history.map((h) => `${h.levelName} desde ${h.since}`).join(" · ")}
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {evaluations.slice(0, 5).map((e) => (
          <li key={e.id} className="rounded-2xl bg-canvas p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-semibold">
                {e.levelName} · {e.evaluatedOn}
              </span>
              <span className="tabular-nums">Promedio {formatAverage(e.average)}</span>
              <Chip tone={EVALUATION_STATUS[e.status].tone}>{EVALUATION_STATUS[e.status].label}</Chip>
            </div>
            <ul className="mt-2 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {e.scores.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="text-ink-soft">{s.criterionName}</span>
                  <span className="font-semibold tabular-nums">{s.score}/5</span>
                </li>
              ))}
            </ul>
            {e.strengths && <p className="mt-2">Fortalezas: {e.strengths}</p>}
            {e.improvements && <p>A mejorar: {e.improvements}</p>}
            {e.comment && <p className="text-ink-soft">{e.comment}</p>}
            {e.status === "APPROVED" && (
              <a
                href={`/api/certificados/${e.id}?escuela=${slug}`}
                className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand"
              >
                <Award className="size-4" /> Certificado de nivel {e.levelName}
              </a>
            )}
          </li>
        ))}
        {evaluations.length === 0 && <li className="text-sm text-ink-soft">Aún no hay evaluaciones.</li>}
      </ul>
    </Card>
  );
}

/** Adapta el resultado de `athleteEvaluations` a la tarjeta. */
export function toEvaluationsView(data: {
  current: { name: string; discipline: string } | null;
  history: { since: string; levelName: string }[];
  evaluations: (Omit<Evaluation, "scores"> & {
    scores: { id: string; criterionName: string; score: number }[];
  })[];
}) {
  return {
    current: data.current,
    history: data.history,
    evaluations: data.evaluations.map((e) => ({
      id: e.id,
      evaluatedOn: e.evaluatedOn,
      levelName: e.levelName,
      average: e.average,
      status: e.status,
      strengths: e.strengths,
      improvements: e.improvements,
      comment: e.comment,
      scores: e.scores.map((s) => ({ id: s.id, criterionName: s.criterionName, score: s.score })),
    })),
  };
}
