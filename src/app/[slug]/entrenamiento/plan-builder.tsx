"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, IconButton, Input, SectionTitle, Select } from "@/components/ui";
import { COMPONENT_LABELS, PHASE_LABELS, phaseFor } from "@/modules/training/labels";
import { savePlanAction } from "./actions";

type Phase = keyof typeof PHASE_LABELS;
type Item = {
  key: string;
  exerciseId: string | null;
  title: string;
  phase: Phase;
  minutes: number;
  notes: string;
};
type Exercise = { id: string; name: string; component: keyof typeof COMPONENT_LABELS; minutes: number };

/** Plan de sesión: calentamiento → parte principal → vuelta a la calma, desde la biblioteca (DEP-31). */
export function PlanBuilder({
  slug,
  planId,
  initial,
  library,
}: {
  slug: string;
  planId: string | null;
  initial: { name: string; objective: string; isTemplate: boolean; items: Omit<Item, "key">[] };
  library: Exercise[];
}) {
  const [name, setName] = useState(initial.name);
  const [objective, setObjective] = useState(initial.objective);
  const [isTemplate, setIsTemplate] = useState(initial.isTemplate);
  const [items, setItems] = useState<Item[]>(initial.items.map((i, n) => ({ ...i, key: String(n) })));
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const found = library.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8);
  const total = items.reduce((s, i) => s + i.minutes, 0);

  const add = (item: Omit<Item, "key">) =>
    setItems((list) => [...list, { ...item, key: crypto.randomUUID() }]);
  const update = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const move = (key: string, delta: number) =>
    setItems((list) => {
      const i = list.findIndex((x) => x.key === key);
      const j = i + delta;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  function save() {
    start(async () => {
      const r = await savePlanAction(slug, planId, {
        name,
        objective,
        isTemplate,
        items: items.map(({ exerciseId, title, phase, minutes, notes }) => ({
          exerciseId,
          title,
          phase,
          minutes,
          notes,
        })),
      });
      if (r && !r.ok) setError(r.message);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre del plan">
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Objetivo">
            <Input value={objective} maxLength={300} onChange={(e) => setObjective(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isTemplate} onChange={(e) => setIsTemplate(e.target.checked)} />
          Guardar como plantilla reutilizable
        </label>
        {(Object.keys(PHASE_LABELS) as Phase[]).map((phase) => {
          const list = items.filter((i) => i.phase === phase);
          return (
            <section key={phase} aria-label={PHASE_LABELS[phase]}>
              <SectionTitle>
                {PHASE_LABELS[phase]} · {list.reduce((s, i) => s + i.minutes, 0)} min
              </SectionTitle>
              <ul className="divide-y divide-line">
                {list.map((i) => (
                  <li key={i.key} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="min-w-40 flex-1 font-semibold">{i.title}</span>
                    <Input
                      type="number"
                      min={1}
                      max={180}
                      aria-label={`Minutos de ${i.title}`}
                      className="w-20"
                      value={i.minutes}
                      onChange={(e) => update(i.key, { minutes: Number(e.target.value) || 1 })}
                    />
                    <Select
                      aria-label={`Fase de ${i.title}`}
                      className="w-auto"
                      value={i.phase}
                      onChange={(e) => update(i.key, { phase: e.target.value as Phase })}
                    >
                      {Object.entries(PHASE_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label={`Notas de ${i.title}`}
                      placeholder="Notas"
                      className="w-48"
                      maxLength={300}
                      value={i.notes}
                      onChange={(e) => update(i.key, { notes: e.target.value })}
                    />
                    <IconButton aria-label={`Subir ${i.title}`} onClick={() => move(i.key, -1)}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton aria-label={`Bajar ${i.title}`} onClick={() => move(i.key, 1)}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton
                      aria-label={`Quitar ${i.title}`}
                      onClick={() => setItems((all) => all.filter((x) => x.key !== i.key))}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                ))}
                {list.length === 0 && <li className="py-2 text-sm text-ink-soft">Sin ejercicios.</li>}
              </ul>
            </section>
          );
        })}
        <p className="text-sm text-ink-soft" role="status">
          Duración total: <span className="font-semibold text-ink">{total} min</span>
        </p>
        {error && <Alert>{error}</Alert>}
        <Button onClick={save} disabled={pending}>
          Guardar plan
        </Button>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Agregar desde la biblioteca</SectionTitle>
        <Input
          aria-label="Buscar en la biblioteca"
          placeholder="Buscar ejercicio"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="divide-y divide-line text-sm" aria-label="Resultados de la biblioteca">
          {found.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1.5">
              <span className="flex-1">
                {e.name}
                <span className="block text-xs text-ink-soft">
                  {COMPONENT_LABELS[e.component]} · {e.minutes} min
                </span>
              </span>
              <IconButton
                aria-label={`Agregar ${e.name}`}
                onClick={() =>
                  add({
                    exerciseId: e.id,
                    title: e.name,
                    phase: phaseFor(e.component),
                    minutes: e.minutes,
                    notes: "",
                  })
                }
              >
                <Plus className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim().length < 2) return;
            add({ exerciseId: null, title: custom.trim(), phase: "MAIN", minutes: 10, notes: "" });
            setCustom("");
          }}
        >
          <Input
            aria-label="Actividad libre"
            placeholder="Actividad libre"
            maxLength={80}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Agregar
          </Button>
        </form>
      </Card>
    </div>
  );
}
