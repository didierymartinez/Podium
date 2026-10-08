"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui";
import { formatAverage } from "@/modules/sports/evaluation-labels";
import { reviewPromotionAction } from "./actions";

type Proposal = {
  evaluationId: string;
  athleteId: string;
  name: string;
  levelName: string;
  nextLevelName: string | null;
  average: number;
  evaluatedOn: string;
};
type Outcome = { tone: "info" | "danger"; text: string; groups?: { id: string; name: string }[] };

/**
 * Propuestas de promoción (DEP-42): aprobar o rechazar. Al aprobar sugiere grupos del nuevo nivel; el
 * resultado se conserva aunque la propuesta salga de la lista tras refrescar.
 */
export function PromotionReview({ slug, proposals }: { slug: string; proposals: Proposal[] }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<Record<string, { proposal: Proposal; outcome: Outcome }>>({});
  const shown = [
    ...proposals.filter((p) => !done[p.evaluationId]),
    ...Object.values(done).map((d) => d.proposal),
  ];

  function review(p: Proposal, decision: "approve" | "reject") {
    start(async () => {
      const r = await reviewPromotionAction(slug, p.evaluationId, decision);
      const outcome: Outcome = !r.ok
        ? {
            tone: "danger",
            text:
              r.error === "last_level"
                ? "Ya está en el último nivel de su modalidad."
                : "No se pudo registrar la decisión.",
          }
        : decision === "reject"
          ? { tone: "info", text: `Promoción de ${p.name} no aprobada.` }
          : {
              tone: "info",
              text: `${p.name} subió a ${r.levelName}. La familia ya puede descargar el certificado.`,
              groups: r.suggestedGroups,
            };
      setDone((d) => ({ ...d, [p.evaluationId]: { proposal: p, outcome } }));
    });
  }

  if (shown.length === 0) return <p className="text-sm text-ink-soft">No hay propuestas pendientes.</p>;
  return (
    <ul className="divide-y divide-line" aria-label="Propuestas de promoción">
      {shown.map((p) => {
        const outcome = done[p.evaluationId]?.outcome;
        return (
          <li key={p.evaluationId} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-ink-soft">
                  {p.levelName} → {p.nextLevelName ?? "último nivel"} · promedio {formatAverage(p.average)} ·{" "}
                  {p.evaluatedOn}
                </p>
              </div>
              {!outcome && (
                <div className="flex gap-2">
                  <Button
                    className="h-9"
                    disabled={pending}
                    aria-label={`Aprobar promoción de ${p.name}`}
                    onClick={() => review(p, "approve")}
                  >
                    Aprobar
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-9"
                    disabled={pending}
                    aria-label={`Rechazar promoción de ${p.name}`}
                    onClick={() => review(p, "reject")}
                  >
                    Rechazar
                  </Button>
                </div>
              )}
            </div>
            {outcome && <Alert tone={outcome.tone}>{outcome.text}</Alert>}
            {outcome?.groups && (
              <p className="text-sm text-ink-soft">
                {outcome.groups.length
                  ? `Grupos sugeridos: ${outcome.groups.map((g) => g.name).join(", ")}. `
                  : "No hay grupos activos de ese nivel. "}
                <Link href={`/${slug}/alumnos/${p.athleteId}`} className="font-semibold text-brand">
                  Cambiar de grupo
                </Link>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
