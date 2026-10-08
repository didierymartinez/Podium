"use client";

import { Archive, Plus, RotateCcw } from "lucide-react";
import { useActionState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Chip, Field, IconButton, Input, SectionTitle, Tile, cn } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import type { ActionState } from "../context";
import { saveConceptAction, setConceptActiveAction } from "../../cobros/actions";

type Concept = { id: string; name: string; defaultAmount: number | null; active: boolean };

export function ConceptsCard({
  slug,
  canEdit,
  concepts,
}: {
  slug: string;
  canEdit: boolean;
  concepts: Concept[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveConceptAction.bind(null, slug),
    {},
  );
  return (
    <Card>
      <SectionTitle>Conceptos de cobro único</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Atajos para cobrar uniformes, inscripciones o eventos.
      </p>
      <ul className="mb-4 space-y-2">
        {concepts.map((c) => (
          <ConceptRow key={c.id} slug={slug} concept={c} canEdit={canEdit} />
        ))}
      </ul>
      {canEdit && (
        <form
          onSubmit={submitWithoutReset(action)}
          className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end"
        >
          <Field label="Nuevo concepto" error={state.errors?.name?.[0]}>
            <Input name="name" required maxLength={60} placeholder="Licra de competencia" />
          </Field>
          <Field label="Valor sugerido" hint="Opcional" error={state.errors?.defaultAmount?.[0]}>
            <MoneyInput name="defaultAmount" />
          </Field>
          <Button type="submit" variant="secondary" className="h-11" disabled={pending}>
            <Plus className="size-4" /> Agregar
          </Button>
          <div className="sm:col-span-3">
            <FormStatus state={state} />
          </div>
        </form>
      )}
    </Card>
  );
}

function ConceptRow({ slug, concept, canEdit }: { slug: string; concept: Concept; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <li>
      <Tile className={cn("flex items-center gap-3 p-3", !concept.active && "opacity-60")}>
        <span className="flex-1 font-semibold">{concept.name}</span>
        {concept.defaultAmount !== null && <Chip>{formatCOP(concept.defaultAmount)}</Chip>}
        {canEdit && (
          <IconButton
            disabled={pending}
            aria-label={concept.active ? `Archivar ${concept.name}` : `Reactivar ${concept.name}`}
            onClick={() =>
              startTransition(() => void setConceptActiveAction(slug, concept.id, !concept.active))
            }
          >
            {concept.active ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}
          </IconButton>
        )}
      </Tile>
    </li>
  );
}
