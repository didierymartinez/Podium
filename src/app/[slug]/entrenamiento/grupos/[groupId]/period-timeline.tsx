"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, IconButton, Input, SectionTitle, Select } from "@/components/ui";
import { PERIOD_KIND_LABELS, PERIOD_PHASE_LABELS } from "@/modules/training/labels";
import { createPeriodAction, deletePeriodAction } from "../../actions";

type Period = {
  id: string;
  kind: keyof typeof PERIOD_KIND_LABELS;
  phase: keyof typeof PERIOD_PHASE_LABELS | null;
  name: string;
  objective: string;
  startsOn: string;
  endsOn: string;
  competition: string | null;
};

const PHASE_COLORS: Record<keyof typeof PERIOD_PHASE_LABELS, string> = {
  GENERAL_PREP: "bg-brand/70",
  SPECIFIC_PREP: "bg-violet/70",
  COMPETITIVE: "bg-danger/70",
  TRANSITION: "bg-mint/70",
};
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Línea de tiempo de la temporada (DEP-33). */
export function PeriodTimeline({
  slug,
  groupId,
  today,
  periods,
  competitions,
}: {
  slug: string;
  groupId: string;
  today: string;
  periods: Period[];
  competitions: { id: string; name: string; startsOn: string }[];
}) {
  const [v, setV] = useState({
    kind: "MESO" as Period["kind"],
    phase: "GENERAL_PREP" as Period["phase"] | "",
    name: "",
    objective: "",
    startsOn: today,
    endsOn: today,
    competitionId: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));
  const from = periods.length ? Math.min(...periods.map((p) => day(p.startsOn))) : 0;
  const to = periods.length ? Math.max(...periods.map((p) => day(p.endsOn))) + 1 : 1;
  const pct = (iso: string) => ((day(iso) - from) / (to - from)) * 100;

  return (
    <Card className="space-y-4" aria-label="Línea de tiempo">
      <SectionTitle>Temporada</SectionTitle>
      {periods.length === 0 ? (
        <p className="text-sm text-ink-soft">Aún no hay macrociclo ni mesociclos para este grupo.</p>
      ) : (
        <ul className="space-y-2" aria-label="Periodos">
          {periods.map((p) => (
            <li key={p.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{p.name}</span>
                <span className="text-ink-soft">
                  {PERIOD_KIND_LABELS[p.kind]}
                  {p.phase ? ` · ${PERIOD_PHASE_LABELS[p.phase]}` : ""} · {p.startsOn} a {p.endsOn}
                </span>
                {p.competition && <span className="text-ink-soft">· Objetivo: {p.competition}</span>}
                <IconButton
                  aria-label={`Borrar ${p.name}`}
                  disabled={pending}
                  onClick={() => start(async () => void (await deletePeriodAction(slug, p.id)))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              <div className="relative h-3 rounded-full bg-muted">
                <div
                  className={`absolute h-3 rounded-full ${p.phase ? PHASE_COLORS[p.phase] : "bg-ink/40"}`}
                  style={{
                    left: `${pct(p.startsOn)}%`,
                    width: `${Math.max(1, pct(p.endsOn) - pct(p.startsOn))}%`,
                  }}
                />
                {today >= periods[0].startsOn && day(today) < to && (
                  <div
                    className="absolute -top-1 h-5 w-0.5 bg-ink"
                    style={{ left: `${pct(today)}%` }}
                    title="Hoy"
                  />
                )}
              </div>
              {p.objective && <p className="text-xs text-ink-soft">{p.objective}</p>}
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-3 border-t border-line pt-3"
        aria-label="Nuevo periodo"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createPeriodAction(slug, {
              groupId,
              kind: v.kind,
              phase: v.phase || null,
              name: v.name,
              objective: v.objective,
              startsOn: v.startsOn,
              endsOn: v.endsOn,
              competitionId: v.competitionId || null,
            });
            setMessage(r.ok ? null : (r.message ?? "No se pudo guardar."));
            if (r.ok) setV((s) => ({ ...s, name: "", objective: "" }));
          });
        }}
      >
        <p className="font-semibold">Nuevo periodo</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo">
            <Select value={v.kind} onChange={(e) => set("kind", e.target.value)}>
              {Object.entries(PERIOD_KIND_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fase">
            <Select value={v.phase ?? ""} onChange={(e) => set("phase", e.target.value)}>
              <option value="">Sin fase</option>
              {Object.entries(PERIOD_PHASE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nombre del periodo">
            <Input value={v.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Inicio">
            <Input type="date" value={v.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
          </Field>
          <Field label="Cierre">
            <Input
              type="date"
              value={v.endsOn}
              min={v.startsOn}
              onChange={(e) => set("endsOn", e.target.value)}
            />
          </Field>
          <Field label="Competencia objetivo">
            <Select value={v.competitionId} onChange={(e) => set("competitionId", e.target.value)}>
              <option value="">Ninguna</option>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.startsOn})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Objetivo principal">
          <Input value={v.objective} maxLength={300} onChange={(e) => set("objective", e.target.value)} />
        </Field>
        {message && <Alert>{message}</Alert>}
        <Button type="submit" variant="secondary" disabled={pending}>
          Agregar periodo
        </Button>
      </form>
    </Card>
  );
}
