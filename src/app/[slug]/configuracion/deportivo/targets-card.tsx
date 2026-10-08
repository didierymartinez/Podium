"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, IconButton, Input, SectionTitle, Select } from "@/components/ui";
import { formatPerformance, parsePerformance, type TestKind } from "@/modules/sports/format";
import { setTargetAction } from "../../marcas/actions";

type Test = { id: string; name: string; kind: TestKind; unit: string };

/** Marcas mínimas u objetivo por prueba y categoría (DEP-54). */
export function TargetsCard({
  slug,
  canEdit,
  tests,
  categories,
  targets,
}: {
  slug: string;
  canEdit: boolean;
  tests: Test[];
  categories: { id: string; name: string }[];
  targets: { testId: string; ageCategoryId: string; value: number }[];
}) {
  const [testId, setTestId] = useState(tests[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const test = tests.find((t) => t.id === testId);
  const label = (t: { testId: string; ageCategoryId: string }) =>
    `${tests.find((x) => x.id === t.testId)?.name ?? ""} · ${categories.find((c) => c.id === t.ageCategoryId)?.name ?? ""}`;
  return (
    <Card>
      <SectionTitle>Marcas objetivo por categoría</SectionTitle>
      <ul className="mb-3 divide-y divide-line text-sm" aria-label="Marcas objetivo">
        {targets.map((t) => {
          const tt = tests.find((x) => x.id === t.testId);
          return (
            <li key={`${t.testId}-${t.ageCategoryId}`} className="flex items-center gap-2 py-1.5">
              <span className="flex-1">{label(t)}</span>
              <span className="font-semibold tabular-nums">
                {tt ? formatPerformance(tt.kind, tt.unit, t.value) : t.value}
              </span>
              {canEdit && (
                <IconButton
                  aria-label={`Quitar objetivo ${label(t)}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => void (await setTargetAction(slug, t.testId, t.ageCategoryId, null)))
                  }
                >
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </li>
          );
        })}
        {targets.length === 0 && <li className="py-1.5 text-ink-soft">Sin marcas objetivo.</li>}
      </ul>
      {canEdit && tests.length > 0 && categories.length > 0 && (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = test ? parsePerformance(test.kind, value) : null;
            if (!parsed) {
              setError("Escribe una marca válida.");
              return;
            }
            setError(null);
            start(async () => {
              await setTargetAction(slug, testId, categoryId, parsed);
              setValue("");
            });
          }}
        >
          <Field label="Prueba objetivo">
            <Select value={testId} onChange={(e) => setTestId(e.target.value)}>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoría objetivo">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Marca objetivo">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={test?.kind === "TIME" ? "45,00" : test?.unit}
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={pending}>
            Guardar objetivo
          </Button>
        </form>
      )}
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}
