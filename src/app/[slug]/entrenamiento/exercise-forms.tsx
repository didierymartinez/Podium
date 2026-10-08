"use client";

import { Archive } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { COMPONENT_LABELS } from "@/modules/training/labels";
import { archiveExerciseAction, createExerciseAction } from "./actions";

const textareaClass =
  "block w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

const EMPTY = {
  name: "",
  component: "TECHNIQUE" as keyof typeof COMPONENT_LABELS,
  disciplineId: "",
  levelIds: [] as string[],
  description: "",
  mediaUrl: "",
  minutes: "10",
  materials: "",
  space: "",
  shared: true,
};

/** Agregar un ejercicio a la biblioteca (DEP-30). */
export function NewExerciseForm({
  slug,
  disciplines,
  levels,
}: {
  slug: string;
  disciplines: { id: string; name: string }[];
  levels: { id: string; name: string }[];
}) {
  const [v, setV] = useState(EMPTY);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof EMPTY>(k: K, value: (typeof EMPTY)[K]) =>
    setV((s) => ({ ...s, [k]: value }));

  return (
    <details className="mt-4 rounded-2xl bg-canvas p-3">
      <summary className="cursor-pointer font-semibold">Nuevo ejercicio</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createExerciseAction(slug, {
              ...v,
              disciplineId: v.disciplineId || null,
              minutes: Number(v.minutes),
            });
            if (!r.ok) setMessage({ tone: "danger", text: r.message });
            else {
              setMessage({ tone: "info", text: `"${v.name}" quedó en la biblioteca.` });
              setV(EMPTY);
            }
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nombre del ejercicio">
            <Input value={v.name} maxLength={80} required onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Componente">
            <Select
              value={v.component}
              onChange={(e) => set("component", e.target.value as typeof v.component)}
            >
              {Object.entries(COMPONENT_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duración (min)">
            <Input
              type="number"
              min={1}
              max={180}
              value={v.minutes}
              onChange={(e) => set("minutes", e.target.value)}
            />
          </Field>
          <Field label="Modalidad">
            <Select value={v.disciplineId} onChange={(e) => set("disciplineId", e.target.value)}>
              <option value="">Todas</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Materiales">
            <Input value={v.materials} maxLength={200} onChange={(e) => set("materials", e.target.value)} />
          </Field>
          <Field label="Espacio">
            <Input value={v.space} maxLength={80} onChange={(e) => set("space", e.target.value)} />
          </Field>
        </div>
        <Field label="Descripción y variantes">
          <textarea
            rows={3}
            maxLength={1500}
            className={textareaClass}
            value={v.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <Field label="Enlace a video o foto" hint="Por ejemplo, un video de YouTube (https://…)">
          <Input value={v.mediaUrl} maxLength={300} onChange={(e) => set("mediaUrl", e.target.value)} />
        </Field>
        <fieldset>
          <legend className="text-sm font-semibold">Niveles (si no eliges ninguno, sirve para todos)</legend>
          <div className="mt-1 flex flex-wrap gap-3 text-sm">
            {levels.map((l) => (
              <label key={l.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={v.levelIds.includes(l.id)}
                  onChange={(e) =>
                    set(
                      "levelIds",
                      e.target.checked ? [...v.levelIds, l.id] : v.levelIds.filter((id) => id !== l.id),
                    )
                  }
                />
                {l.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!v.shared} onChange={(e) => set("shared", !e.target.checked)} />
          Solo para mí (no compartir con la escuela)
        </label>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" disabled={pending}>
          Guardar ejercicio
        </Button>
      </form>
    </details>
  );
}

export function ArchiveExerciseButton({
  slug,
  exerciseId,
  name,
}: {
  slug: string;
  exerciseId: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      className="h-8"
      disabled={pending}
      aria-label={`Archivar ${name}`}
      onClick={() => start(async () => void (await archiveExerciseAction(slug, exerciseId)))}
    >
      <Archive className="size-4" /> Archivar
    </Button>
  );
}
