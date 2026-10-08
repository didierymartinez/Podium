"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Chip, Field, Input, SectionTitle, Select, cn } from "@/components/ui";
import { FULFILLMENT_LABELS, PHASE_LABELS } from "@/modules/training/labels";
import { saveSessionReportAction } from "../../entrenamiento/actions";

type Fulfillment = keyof typeof FULFILLMENT_LABELS;

/** Plan del día (DEP-34) y registro post-sesión con RPE (DEP-35). */
export function SessionPlanCard({
  slug,
  sessionId,
  plan,
  items,
  report,
  duration,
}: {
  slug: string;
  sessionId: string;
  plan: { id: string; name: string; objective: string } | null;
  items: {
    id: string;
    title: string;
    phase: keyof typeof PHASE_LABELS;
    minutes: number;
    notes: string | null;
  }[];
  report: { fulfilled: Fulfillment; rpe: number; minutes: number; notes: string | null } | null;
  duration: number;
}) {
  const [fulfilled, setFulfilled] = useState<Fulfillment>(report?.fulfilled ?? "YES");
  const [rpe, setRpe] = useState(String(report?.rpe ?? 5));
  const [minutes, setMinutes] = useState(String(report?.minutes ?? Math.min(Math.max(duration, 1), 600)));
  const [notes, setNotes] = useState(report?.notes ?? "");
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card className="space-y-4" aria-label="Plan del día">
      <div>
        <SectionTitle>Plan del día</SectionTitle>
        {plan ? (
          <>
            <p className="font-semibold">{plan.name}</p>
            {plan.objective && <p className="text-sm text-ink-soft">{plan.objective}</p>}
            <ol className="mt-2 space-y-1 text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2">
                  <Chip>{PHASE_LABELS[i.phase]}</Chip>
                  <span className="flex-1">
                    {i.title}
                    {i.notes && <span className="text-ink-soft"> · {i.notes}</span>}
                  </span>
                  <span className="tabular-nums text-ink-soft">{i.minutes} min</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            Esta clase no tiene plan.{" "}
            <Link href={`/${slug}/entrenamiento`} className="font-semibold text-brand">
              Asignar uno
            </Link>
          </p>
        )}
      </div>
      <form
        className="space-y-3 border-t border-line pt-3"
        aria-label="Registro post-sesión"
        action={() =>
          start(async () => {
            const r = await saveSessionReportAction(slug, sessionId, {
              fulfilled,
              rpe: Number(rpe),
              minutes: Number(minutes),
              notes,
            });
            setMessage(
              r.ok
                ? { tone: "info", text: "Registro de la sesión guardado." }
                : { tone: "danger", text: "No se pudo guardar el registro." },
            );
          })
        }
      >
        <p className="font-semibold">Después de la clase</p>
        <div
          role="radiogroup"
          aria-label="¿Se cumplió el plan?"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm">¿Se cumplió el plan?</span>
          {(Object.keys(FULFILLMENT_LABELS) as Fulfillment[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={fulfilled === k}
              onClick={() => setFulfilled(k)}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-semibold",
                fulfilled === k ? "bg-brand text-white" : "bg-muted text-ink-soft",
              )}
            >
              {FULFILLMENT_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Esfuerzo del grupo (RPE 0–10)" hint="0 = reposo, 10 = esfuerzo máximo">
            <Select value={rpe} onChange={(e) => setRpe(e.target.value)}>
              {Array.from({ length: 11 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Minutos entrenados">
            <Input
              type="number"
              min={1}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notas de la sesión">
          <Input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" variant="secondary" disabled={pending}>
          Guardar registro
        </Button>
      </form>
    </Card>
  );
}
