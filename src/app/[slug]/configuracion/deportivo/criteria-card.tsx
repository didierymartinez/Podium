"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Card, IconButton, Input, SectionTitle, Select } from "@/components/ui";
import { PROMOTION_HINT } from "@/modules/sports/evaluation-labels";
import { addCriterionAction, removeCriterionAction } from "../../evaluaciones/actions";

/** Rúbrica de evaluación por nivel (DEP-40). */
export function CriteriaCard({
  slug,
  canEdit,
  levels,
  criteria,
}: {
  slug: string;
  canEdit: boolean;
  levels: { id: string; name: string }[];
  criteria: { id: string; levelId: string; name: string }[];
}) {
  const [levelId, setLevelId] = useState(levels[0]?.id ?? "");
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const list = criteria.filter((c) => c.levelId === levelId);
  return (
    <Card>
      <SectionTitle>Criterios de evaluación por nivel</SectionTitle>
      <p className="mb-3 text-sm text-ink-soft">Se califican de 1 a 5; {PROMOTION_HINT}.</p>
      <Select aria-label="Nivel de la rúbrica" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
        {levels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
      <ul className="my-3 divide-y divide-line text-sm" aria-label="Criterios del nivel">
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-1.5">
            <span className="flex-1">{c.name}</span>
            {canEdit && (
              <IconButton
                aria-label={`Quitar criterio ${c.name}`}
                disabled={pending}
                onClick={() => start(async () => void (await removeCriterionAction(slug, c.id)))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="py-1.5 text-ink-soft">Este nivel no tiene criterios.</li>}
      </ul>
      {canEdit && levelId && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 3) return;
            start(async () => {
              const r = await addCriterionAction(slug, levelId, name);
              if (r.ok) setName("");
            });
          }}
        >
          <Input
            aria-label="Nuevo criterio"
            placeholder="Ej.: Frenado en T"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={pending}>
            <Plus className="size-4" /> Agregar
          </Button>
        </form>
      )}
    </Card>
  );
}
