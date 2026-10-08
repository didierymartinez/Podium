"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  saveAssessmentAction,
  recordMeasurementAction,
  deleteMeasurementAction,
  setBodyConsentAction,
} from "@/app/[slug]/alumnos/body-actions";
import { BODY_METRICS, formatMetric, type BodyMetricKey } from "@/modules/athletes/body-labels";
import { LineChart } from "./line-chart";
import { Alert, Button, Card, Field, IconButton, Input, SectionTitle, Select } from "./ui";

const textareaClass =
  "block w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

type Measurement = { id: string; measuredOn: string; source: "MANUAL" | "INBODY" } & Record<
  BodyMetricKey,
  number | null
>;
type Assessment = {
  assessedOn: string;
  goals: string;
  sportsBackground: string;
  notes: string;
  healthHistory: string | null;
};

const CHARTS: { key: BodyMetricKey; invert?: boolean }[] = [
  { key: "weightKg" },
  { key: "bodyFatPercent", invert: true },
  { key: "skeletalMuscleKg" },
];

/**
 * Valoración inicial y composición corporal (EVALUACION_GIMNASIOS §4, DEP-56). En modo `staff` la
 * administración edita; en modo `family` el acudiente ve el progreso y da o retira el permiso.
 */
export function BodyCard({
  slug,
  athleteId,
  firstName,
  mode,
  today,
  assessment,
  consent,
  measurements,
}: {
  slug: string;
  athleteId: string;
  firstName: string;
  mode: "staff" | "family";
  today: string;
  assessment: Assessment | null;
  consent: { grantedAt: string; source: string } | null;
  measurements: Measurement[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const done = (r: { ok: boolean; message?: string }, ok: string) =>
    setMessage(
      r.ok ? { tone: "info", text: ok } : { tone: "danger", text: r.message ?? "No se pudo guardar." },
    );

  return (
    <Card
      className="space-y-4"
      aria-label={mode === "family" ? `Valoración de ${firstName}` : "Valoración y composición corporal"}
    >
      <SectionTitle>
        {mode === "family" ? `Valoración de ${firstName}` : "Valoración y composición corporal"}
      </SectionTitle>
      {mode === "staff" ? (
        <AssessmentForm
          initial={assessment}
          today={today}
          pending={pending}
          onSave={(input) =>
            start(async () =>
              done(await saveAssessmentAction(slug, athleteId, input), "Valoración guardada."),
            )
          }
        />
      ) : (
        assessment && (
          <div className="space-y-1 text-sm">
            <p className="text-ink-soft">Valoración inicial del {assessment.assessedOn}</p>
            {assessment.goals && <p>Objetivos: {assessment.goals}</p>}
            {assessment.notes && <p>{assessment.notes}</p>}
          </div>
        )
      )}

      <div className="rounded-2xl bg-canvas p-3 text-sm">
        {consent ? (
          <p>
            Permiso para medidas corporales:{" "}
            <span className="font-semibold">
              dado el {consent.grantedAt.slice(0, 10)}
              {consent.source === "school" ? " (registrado por la escuela)" : " por el acudiente"}
            </span>
          </p>
        ) : (
          <p>
            {mode === "family"
              ? `¿Autorizas a la escuela a registrar peso, talla y composición corporal de ${firstName}? Solo lo ven la escuela y tu familia.`
              : "Sin permiso del acudiente: no se pueden registrar medidas corporales."}
          </p>
        )}
        <Button
          variant="secondary"
          className="mt-2 h-9"
          disabled={pending}
          onClick={() =>
            start(async () =>
              done(
                await setBodyConsentAction(slug, athleteId, !consent),
                consent ? "Permiso retirado." : "Permiso registrado.",
              ),
            )
          }
        >
          {consent
            ? "Retirar permiso"
            : mode === "family"
              ? "Dar permiso"
              : "Registrar permiso del acudiente (en papel)"}
        </Button>
      </div>

      {measurements.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {CHARTS.map(({ key, invert }) => {
              const meta = BODY_METRICS.find((m) => m.key === key)!;
              const points = measurements
                .filter((m) => m[key] !== null)
                .map((m) => ({ label: m.measuredOn, value: m[key] as number }));
              if (points.length === 0) return null;
              return (
                <div key={key}>
                  <p className="text-sm font-semibold">
                    {meta.label}: {formatMetric(points[points.length - 1].value, meta.unit)}
                  </p>
                  <LineChart
                    title={meta.label}
                    points={points}
                    invert={invert}
                    format={(n) => formatMetric(n, meta.unit)}
                  />
                </div>
              );
            })}
          </div>
          <ul className="divide-y divide-line text-sm" aria-label="Mediciones">
            {[...measurements].reverse().map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="font-semibold">{m.measuredOn}</span>
                <span className="text-ink-soft">{m.source === "INBODY" ? "InBody" : "Manual"}</span>
                <span className="flex-1">
                  {BODY_METRICS.filter((x) => m[x.key] !== null)
                    .map((x) => `${x.label} ${formatMetric(m[x.key] as number, x.unit)}`)
                    .join(" · ")}
                </span>
                {mode === "staff" && (
                  <IconButton
                    aria-label={`Borrar medición del ${m.measuredOn}`}
                    disabled={pending}
                    onClick={() =>
                      start(async () => done(await deleteMeasurementAction(slug, m.id), "Medición borrada."))
                    }
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {mode === "staff" && consent && (
        <MeasurementForm
          today={today}
          pending={pending}
          onSave={(input, reset) =>
            start(async () => {
              const r = await recordMeasurementAction(slug, athleteId, input);
              done(r, "Medición guardada.");
              if (r.ok) reset();
            })
          }
        />
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </Card>
  );
}

function AssessmentForm({
  initial,
  today,
  pending,
  onSave,
}: {
  initial: Assessment | null;
  today: string;
  pending: boolean;
  onSave: (input: Omit<Assessment, "healthHistory"> & { healthHistory: string }) => void;
}) {
  const [v, setV] = useState({
    assessedOn: initial?.assessedOn ?? today,
    goals: initial?.goals ?? "",
    sportsBackground: initial?.sportsBackground ?? "",
    healthHistory: initial?.healthHistory ?? "",
    notes: initial?.notes ?? "",
  });
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));
  return (
    <details open={!initial}>
      <summary className="cursor-pointer text-sm font-semibold">
        {initial ? `Valoración inicial del ${initial.assessedOn}` : "Registrar valoración inicial"}
      </summary>
      {initial?.goals && <p className="mt-1 text-sm">Objetivos: {initial.goals}</p>}
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(v);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha de la valoración">
            <Input
              type="date"
              max={today}
              value={v.assessedOn}
              onChange={(e) => set("assessedOn", e.target.value)}
            />
          </Field>
          <Field label="Objetivos">
            <Input maxLength={1000} value={v.goals} onChange={(e) => set("goals", e.target.value)} />
          </Field>
        </div>
        <Field label="Experiencia deportiva previa">
          <Input
            maxLength={1000}
            value={v.sportsBackground}
            onChange={(e) => set("sportsBackground", e.target.value)}
          />
        </Field>
        <Field
          label="Antecedentes de salud"
          hint="Confidencial: se guarda cifrado y solo lo ve la administración."
        >
          <textarea
            rows={2}
            maxLength={1500}
            className={textareaClass}
            value={v.healthHistory}
            onChange={(e) => set("healthHistory", e.target.value)}
          />
        </Field>
        <Field label="Observaciones y test inicial">
          <textarea
            rows={2}
            maxLength={1000}
            className={textareaClass}
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          Guardar valoración
        </Button>
      </form>
    </details>
  );
}

const EMPTY_MEASURE = Object.fromEntries(BODY_METRICS.map((m) => [m.key, ""])) as Record<
  BodyMetricKey,
  string
>;

function MeasurementForm({
  today,
  pending,
  onSave,
}: {
  today: string;
  pending: boolean;
  onSave: (input: Record<string, unknown>, reset: () => void) => void;
}) {
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<"MANUAL" | "INBODY">("INBODY");
  const [values, setValues] = useState(EMPTY_MEASURE);
  const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);
  return (
    <form
      className="space-y-3 border-t border-line pt-3"
      aria-label="Nueva medición"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(
          {
            measuredOn: date,
            source,
            ...Object.fromEntries(
              BODY_METRICS.map((m) => {
                const n = num(values[m.key]);
                return [m.key, n !== null && m.key === "basalMetabolismKcal" ? Math.round(n) : n];
              }),
            ),
          },
          () => setValues(EMPTY_MEASURE),
        );
      }}
    >
      <p className="font-semibold">Nueva medición</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fecha de la medición">
          <Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Origen">
          <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="INBODY">InBody</option>
            <option value="MANUAL">Manual</option>
          </Select>
        </Field>
        {BODY_METRICS.map((m) => (
          <Field key={m.key} label={`${m.label} (${m.unit})`}>
            <Input
              inputMode="decimal"
              value={values[m.key]}
              onChange={(e) => setValues((v) => ({ ...v, [m.key]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        Guardar medición
      </Button>
    </form>
  );
}
