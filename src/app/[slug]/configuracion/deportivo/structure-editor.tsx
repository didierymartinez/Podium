"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Chip, Field, IconButton, Input, SectionTitle, Select } from "@/components/ui";
import { TEST_CONTEXT_LABELS, TEST_KIND_LABELS } from "@/modules/sports/labels";
import type { StructureResult } from "@/modules/sports/structure";
import {
  deleteCategoryAction,
  enableDisciplineAction,
  moveLevelAction,
  removeLevelAction,
  restoreLevelAction,
  saveCategoryAction,
  saveLevelAction,
  saveTestAction,
  setDisciplineActiveAction,
  setTestActiveAction,
} from "./actions";

/** Ejecuta una acción y muestra su error, si lo hay. */
function useRunner() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<StructureResult>, onOk?: () => void) =>
    start(async () => {
      const result = await fn();
      setError(result.ok ? null : result.error);
      if (result.ok) onOk?.();
    });
  return { error, pending, run };
}

export function DisciplinesCard({
  slug,
  canEdit,
  disciplines,
  available,
}: {
  slug: string;
  canEdit: boolean;
  disciplines: { id: string; name: string; active: boolean; groups: number }[];
  available: { code: string; name: string }[];
}) {
  const { error, pending, run } = useRunner();
  return (
    <Card>
      <SectionTitle>Modalidades</SectionTitle>
      <ul className="space-y-2" aria-label="Modalidades">
        {disciplines.map((d) => (
          <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-canvas px-3 py-2">
            <span className="flex-1 font-semibold">{d.name}</span>
            <span className="text-xs text-ink-soft">{d.groups} grupos</span>
            {d.active ? <Chip tone="mint">Activa</Chip> : <Chip>Inactiva</Chip>}
            {canEdit && (
              <Button
                variant="ghost"
                className="h-8 px-3"
                disabled={pending}
                onClick={() => run(() => setDisciplineActiveAction(slug, d.id, !d.active))}
              >
                {d.active ? "Desactivar" : "Activar"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && available.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {available.map((a) => (
            <Button
              key={a.code}
              variant="secondary"
              className="h-9"
              disabled={pending}
              onClick={() => run(() => enableDisciplineAction(slug, a.code))}
            >
              <Plus className="size-4" /> {a.name}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}

export function LevelsCard({
  slug,
  canEdit,
  discipline,
  levels,
}: {
  slug: string;
  canEdit: boolean;
  discipline: { id: string; name: string };
  levels: { id: string; name: string; goal: string | null; active: boolean; groups: number }[];
}) {
  const { error, pending, run } = useRunner();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const current = levels.find((l) => l.id === editing);
  return (
    <Card>
      <SectionTitle
        action={
          canEdit && (
            <Button variant="secondary" className="h-9" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Nivel
            </Button>
          )
        }
      >
        Niveles · {discipline.name}
      </SectionTitle>
      <ol className="space-y-2" aria-label={`Niveles de ${discipline.name}`}>
        {levels.map((l, i) => (
          <li key={l.id} className="flex items-center gap-2 rounded-2xl bg-canvas px-3 py-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={
                  l.active ? "block font-semibold" : "block font-semibold text-ink-soft line-through"
                }
              >
                {l.name}
              </span>
              {l.goal && <span className="block truncate text-xs text-ink-soft">{l.goal}</span>}
            </span>
            {canEdit && (
              <span className="flex shrink-0 items-center gap-1">
                <IconButton
                  aria-label={`Subir ${l.name}`}
                  disabled={pending || i === 0}
                  onClick={() => run(() => moveLevelAction(slug, l.id, "up"))}
                >
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton
                  aria-label={`Bajar ${l.name}`}
                  disabled={pending || i === levels.length - 1}
                  onClick={() => run(() => moveLevelAction(slug, l.id, "down"))}
                >
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton aria-label={`Editar ${l.name}`} onClick={() => setEditing(l.id)}>
                  <Pencil className="size-4" />
                </IconButton>
                {l.active ? (
                  <IconButton
                    aria-label={l.groups ? `Archivar ${l.name}` : `Eliminar ${l.name}`}
                    disabled={pending}
                    onClick={() => run(() => removeLevelAction(slug, l.id))}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                ) : (
                  <Button
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => run(() => restoreLevelAction(slug, l.id))}
                  >
                    Restaurar
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
      {editing && (
        <form
          className="mt-3 grid gap-2 rounded-2xl border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                saveLevelAction(
                  slug,
                  { disciplineId: discipline.id, name: String(f.get("name")), goal: String(f.get("goal")) },
                  editing === "new" ? undefined : editing,
                ),
              () => setEditing(null),
            );
          }}
        >
          <Field label="Nombre del nivel">
            <Input name="name" defaultValue={current?.name ?? ""} required maxLength={40} />
          </Field>
          <Field label="Objetivo">
            <Input name="goal" defaultValue={current?.goal ?? ""} maxLength={160} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              Guardar nivel
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}

const ageText = (c: { minAge: number | null; maxAge: number | null }) =>
  c.minAge === null
    ? `Hasta ${c.maxAge} años`
    : c.maxAge === null
      ? `${c.minAge} o más años`
      : `${c.minAge} a ${c.maxAge} años`;
const toAge = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Number(v));

export function CategoriesCard({
  slug,
  canEdit,
  categories,
}: {
  slug: string;
  canEdit: boolean;
  categories: { id: string; name: string; minAge: number | null; maxAge: number | null }[];
}) {
  const { error, pending, run } = useRunner();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const current = categories.find((c) => c.id === editing);
  return (
    <Card>
      <SectionTitle
        action={
          canEdit && (
            <Button variant="secondary" className="h-9" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Categoría
            </Button>
          )
        }
      >
        Categorías por edad
      </SectionTitle>
      <p className="-mt-2 mb-3 text-xs text-ink-soft">
        Edad deportiva = año de la temporada − año de nacimiento. Ajústalas al reglamento de tu liga.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Categorías por edad">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-2xl bg-canvas px-3 py-2">
            <span className="flex-1">
              <span className="block text-sm font-semibold">{c.name}</span>
              <span className="block text-xs text-ink-soft">{ageText(c)}</span>
            </span>
            {canEdit && (
              <>
                <IconButton aria-label={`Editar ${c.name}`} onClick={() => setEditing(c.id)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  aria-label={`Eliminar ${c.name}`}
                  disabled={pending}
                  onClick={() => run(() => deleteCategoryAction(slug, c.id))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <form
          className="mt-3 grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                saveCategoryAction(
                  slug,
                  {
                    name: String(f.get("name")),
                    minAge: toAge(f.get("minAge")),
                    maxAge: toAge(f.get("maxAge")),
                  },
                  editing === "new" ? undefined : editing,
                ),
              () => setEditing(null),
            );
          }}
        >
          <Field label="Nombre">
            <Input name="name" defaultValue={current?.name ?? ""} required maxLength={40} />
          </Field>
          <Field label="Desde (años)">
            <Input name="minAge" type="number" min={0} max={99} defaultValue={current?.minAge ?? ""} />
          </Field>
          <Field label="Hasta (años)">
            <Input name="maxAge" type="number" min={0} max={99} defaultValue={current?.maxAge ?? ""} />
          </Field>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" disabled={pending}>
              Guardar categoría
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}

type TestView = {
  id: string;
  disciplineId: string | null;
  name: string;
  kind: keyof typeof TEST_KIND_LABELS;
  unit: string;
  lowerIsBetter: boolean;
  context: keyof typeof TEST_CONTEXT_LABELS;
  active: boolean;
};

export function TestsCard({
  slug,
  canEdit,
  disciplines,
  tests,
}: {
  slug: string;
  canEdit: boolean;
  disciplines: { id: string; name: string }[];
  tests: TestView[];
}) {
  const { error, pending, run } = useRunner();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const current = tests.find((t) => t.id === editing);
  const disciplineName = (id: string | null) =>
    id ? (disciplines.find((d) => d.id === id)?.name ?? "") : "Todas";
  return (
    <Card>
      <SectionTitle
        action={
          canEdit && (
            <Button variant="secondary" className="h-9" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Prueba
            </Button>
          )
        }
      >
        Pruebas y métricas
      </SectionTitle>
      {(Object.keys(TEST_CONTEXT_LABELS) as (keyof typeof TEST_CONTEXT_LABELS)[]).map((ctx) => {
        const list = tests.filter((t) => t.context === ctx);
        if (list.length === 0) return null;
        return (
          <div key={ctx} className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {TEST_CONTEXT_LABELS[ctx]}
            </p>
            <ul
              className="divide-y divide-line text-sm"
              aria-label={`Pruebas de ${TEST_CONTEXT_LABELS[ctx]}`}
            >
              {list.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-1.5">
                  <span className={t.active ? "flex-1" : "flex-1 text-ink-soft line-through"}>
                    {t.name}
                    <span className="ml-2 text-xs text-ink-soft">
                      {TEST_KIND_LABELS[t.kind]} · {t.unit} ·{" "}
                      {t.lowerIsBetter ? "menor es mejor" : "mayor es mejor"} ·{" "}
                      {disciplineName(t.disciplineId)}
                    </span>
                  </span>
                  {canEdit && (
                    <>
                      <IconButton aria-label={`Editar ${t.name}`} onClick={() => setEditing(t.id)}>
                        <Pencil className="size-4" />
                      </IconButton>
                      <Button
                        variant="ghost"
                        className="h-8 px-2"
                        disabled={pending}
                        onClick={() => run(() => setTestActiveAction(slug, t.id, !t.active))}
                      >
                        {t.active ? "Desactivar" : "Activar"}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {editing && (
        <form
          className="mt-3 grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                saveTestAction(
                  slug,
                  {
                    disciplineId: String(f.get("disciplineId")) || null,
                    name: String(f.get("name")),
                    kind: String(f.get("kind")) as TestView["kind"],
                    unit: String(f.get("unit")),
                    lowerIsBetter: f.get("better") === "lower",
                    context: String(f.get("context")) as TestView["context"],
                  },
                  editing === "new" ? undefined : editing,
                ),
              () => setEditing(null),
            );
          }}
        >
          <Field label="Nombre de la prueba">
            <Input name="name" defaultValue={current?.name ?? ""} required maxLength={60} />
          </Field>
          <Field label="Modalidad">
            <Select name="disciplineId" defaultValue={current?.disciplineId ?? ""}>
              <option value="">Todas (física)</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select name="kind" defaultValue={current?.kind ?? "TIME"}>
              {Object.entries(TEST_KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unidad">
            <Input name="unit" defaultValue={current?.unit ?? "s"} required maxLength={12} />
          </Field>
          <Field label="Mejor marca">
            <Select name="better" defaultValue={current && !current.lowerIsBetter ? "higher" : "lower"}>
              <option value="lower">Menor es mejor</option>
              <option value="higher">Mayor es mejor</option>
            </Select>
          </Field>
          <Field label="Contexto">
            <Select name="context" defaultValue={current?.context ?? "TRACK"}>
              {Object.entries(TEST_CONTEXT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Guardar prueba
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}
