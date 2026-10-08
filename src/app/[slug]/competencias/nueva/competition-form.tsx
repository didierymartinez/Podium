"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, IconButton, Input, SectionTitle, Select } from "@/components/ui";
import {
  COMPETITION_KINDS,
  DEFAULT_AUTHORIZATION,
  KIND_LABELS,
  type CompetitionKind,
} from "@/modules/competitions/labels";
import { createCompetitionAction } from "../actions";

const textareaClass =
  "block w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";
const money = (v: string) => Number(v.replace(/\D/g, "")) || 0;

/** Evento con pruebas, costos y requisitos (DEP-60). */
export function CompetitionForm({
  slug,
  today,
  defaults,
  categories,
  documentTypes,
}: {
  slug: string;
  today: string;
  defaults: { startsOn: string; deadline: string; city: string };
  categories: { id: string; name: string }[];
  documentTypes: { id: string; name: string }[];
}) {
  const [v, setV] = useState({
    name: "",
    kind: "LEAGUE" as CompetitionKind,
    startsOn: defaults.startsOn,
    endsOn: defaults.startsOn,
    city: defaults.city,
    venue: "",
    registrationDeadline: defaults.deadline,
    events: "",
    entryFee: "",
    authorizationText: DEFAULT_AUTHORIZATION,
    notes: "",
    requireNoDebt: true,
  });
  const [extras, setExtras] = useState<{ name: string; amount: string }[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, value: string | boolean) => setV((s) => ({ ...s, [k]: value }));
  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...list, id] : list.filter((x) => x !== id);

  return (
    <form
      className="grid gap-4 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createCompetitionAction(slug, {
            ...v,
            events: v.events
              .split(/[,\n]/)
              .map((x) => x.trim())
              .filter(Boolean),
            entryFee: money(v.entryFee),
            extras: extras
              .filter((x) => x.name.trim())
              .map((x) => ({ name: x.name.trim(), amount: money(x.amount) })),
            categoryIds,
            requiredDocumentTypeIds: docIds,
          });
          if (r && !r.ok) setError(r.message);
        });
      }}
    >
      <Card className="space-y-3">
        <SectionTitle>Evento</SectionTitle>
        <Field label="Nombre">
          <Input
            value={v.name}
            required
            maxLength={120}
            placeholder="Válida departamental"
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <Select value={v.kind} onChange={(e) => set("kind", e.target.value)}>
              {COMPETITION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ciudad">
            <Input value={v.city} maxLength={80} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Desde">
            <Input
              type="date"
              value={v.startsOn}
              min={today}
              onChange={(e) => set("startsOn", e.target.value)}
            />
          </Field>
          <Field label="Hasta">
            <Input
              type="date"
              value={v.endsOn}
              min={v.startsOn}
              onChange={(e) => set("endsOn", e.target.value)}
            />
          </Field>
          <Field label="Escenario">
            <Input value={v.venue} maxLength={120} onChange={(e) => set("venue", e.target.value)} />
          </Field>
          <Field label="Inscripciones hasta">
            <Input
              type="date"
              value={v.registrationDeadline}
              min={today}
              max={v.startsOn}
              onChange={(e) => set("registrationDeadline", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Pruebas" hint="Separadas por coma: 200 m CRI, 500 m, 10.000 m puntos">
          <Input value={v.events} required onChange={(e) => set("events", e.target.value)} />
        </Field>
        <Field label="Notas para las familias">
          <textarea
            rows={2}
            maxLength={1000}
            className={textareaClass}
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </Card>

      <div className="space-y-4">
        <Card className="space-y-3">
          <SectionTitle>Costos</SectionTitle>
          <Field label="Inscripción" hint="Se cobra al aceptar la convocatoria">
            <Input
              inputMode="numeric"
              value={v.entryFee}
              placeholder="0"
              onChange={(e) => set("entryFee", e.target.value)}
            />
          </Field>
          <p className="text-sm font-semibold">Servicios opcionales</p>
          {extras.map((x, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`Servicio ${i + 1}`}
                placeholder="Transporte"
                value={x.name}
                maxLength={60}
                onChange={(e) =>
                  setExtras((l) => l.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))
                }
              />
              <Input
                aria-label={`Valor del servicio ${i + 1}`}
                inputMode="numeric"
                placeholder="0"
                value={x.amount}
                onChange={(e) =>
                  setExtras((l) => l.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))
                }
              />
              <IconButton
                aria-label={`Quitar servicio ${i + 1}`}
                onClick={() => setExtras((l) => l.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="h-9"
            onClick={() => setExtras((l) => [...l, { name: "", amount: "" }])}
          >
            <Plus className="size-4" /> Agregar servicio
          </Button>
        </Card>
        <Card className="space-y-3">
          <SectionTitle>Requisitos</SectionTitle>
          <fieldset>
            <legend className="text-sm font-semibold">Categorías admitidas (ninguna = todas)</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(c.id)}
                    onChange={(e) => setCategoryIds((l) => toggle(l, c.id, e.target.checked))}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">Documentos vigentes</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {documentTypes.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={docIds.includes(d.id)}
                    onChange={(e) => setDocIds((l) => toggle(l, d.id, e.target.checked))}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.requireNoDebt}
              onChange={(e) => set("requireNoDebt", e.target.checked)}
            />
            Exigir estar al día en pagos (paz y salvo)
          </label>
          <Field label="Texto de la autorización del acudiente">
            <textarea
              rows={4}
              maxLength={2000}
              className={textareaClass}
              value={v.authorizationText}
              onChange={(e) => set("authorizationText", e.target.value)}
            />
          </Field>
        </Card>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={pending}>
          Crear competencia
        </Button>
      </div>
    </form>
  );
}
