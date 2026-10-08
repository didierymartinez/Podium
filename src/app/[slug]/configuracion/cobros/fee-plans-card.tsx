"use client";

import { Archive, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { Button, Card, Chip, Field, IconButton, Input, SectionTitle, Tile, cn } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { saveFeePlanAction, setFeePlanActiveAction } from "../actions";
import type { ActionState } from "../context";
import { submitWithoutReset } from "@/components/use-form-action";

export type FeePlanView = {
  id: string;
  name: string;
  description: string | null;
  monthlyAmount: number;
  active: boolean;
};

export function FeePlansCard({
  slug,
  plans,
  canEdit,
}: {
  slug: string;
  plans: FeePlanView[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(plans.length === 0 && canEdit ? "new" : null);

  return (
    <Card>
      <SectionTitle
        action={
          canEdit &&
          editing !== "new" && (
            <Button variant="secondary" className="h-9 px-4" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Nueva tarifa
            </Button>
          )
        }
      >
        Tarifas mensuales
      </SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Cada matrícula se asocia a una tarifa. Ej.: “Iniciación 3 días/semana”, “Competencia 5 días/semana”.
      </p>

      <ul className="space-y-2.5">
        {editing === "new" && (
          <li>
            <FeePlanEditor slug={slug} onDone={() => setEditing(null)} />
          </li>
        )}
        {plans.map((plan) =>
          editing === plan.id ? (
            <li key={plan.id}>
              <FeePlanEditor slug={slug} plan={plan} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={plan.id}>
              <FeePlanRow slug={slug} plan={plan} canEdit={canEdit} onEdit={() => setEditing(plan.id)} />
            </li>
          ),
        )}
        {plans.length === 0 && editing !== "new" && (
          <Tile className="text-center text-sm text-ink-soft">Aún no hay tarifas.</Tile>
        )}
      </ul>
    </Card>
  );
}

function FeePlanRow({
  slug,
  plan,
  canEdit,
  onEdit,
}: {
  slug: string;
  plan: FeePlanView;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const toggle = () => startTransition(() => void setFeePlanActiveAction(slug, plan.id, !plan.active));

  return (
    <Tile className={cn("flex flex-wrap items-center gap-3", !plan.active && "opacity-60")}>
      <div className="min-w-0 flex-1 basis-full sm:basis-0">
        <p className="truncate font-semibold">{plan.name}</p>
        {plan.description && <p className="truncate text-sm text-ink-soft">{plan.description}</p>}
      </div>
      <div className="flex items-center gap-2 sm:block sm:text-right">
        <p className="font-semibold tabular-nums">{formatCOP(plan.monthlyAmount)}</p>
        <Chip tone={plan.active ? "mint" : "neutral"} dot className="sm:mt-1">
          {plan.active ? "Activa" : "Archivada"}
        </Chip>
      </div>
      {canEdit && (
        <div className="ml-auto flex gap-1.5">
          <IconButton onClick={onEdit} title="Editar" aria-label={`Editar ${plan.name}`} disabled={pending}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton
            onClick={toggle}
            disabled={pending}
            title={plan.active ? "Archivar" : "Reactivar"}
            aria-label={plan.active ? `Archivar ${plan.name}` : `Reactivar ${plan.name}`}
          >
            {plan.active ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}
          </IconButton>
        </div>
      )}
    </Tile>
  );
}

function FeePlanEditor({ slug, plan, onDone }: { slug: string; plan?: FeePlanView; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await saveFeePlanAction(slug, prev, form);
    if (result.ok) onDone();
    return result;
  }, {});
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <Tile className="border-brand/30 bg-surface ring-4 ring-brand/8">
      <form onSubmit={submitWithoutReset(action)} className="space-y-4">
        {plan && <input type="hidden" name="id" value={plan.id} />}
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Nombre" error={error("name")}>
            <Input
              name="name"
              defaultValue={plan?.name}
              required
              maxLength={60}
              placeholder="Iniciación 3 días/semana"
              autoFocus
            />
          </Field>
          <Field label="Valor mensual" error={error("monthlyAmount")}>
            <MoneyInput
              name="monthlyAmount"
              defaultValue={plan?.monthlyAmount}
              required
              placeholder="120.000"
            />
          </Field>
        </div>
        <Field
          label="Descripción"
          hint="Opcional · días, horario o lo que incluye"
          error={error("description")}
        >
          <Input name="description" defaultValue={plan?.description ?? ""} maxLength={160} />
        </Field>
        {plan && (
          <p className="text-xs text-ink-soft">
            Un cambio de valor aplica a los cobros que se generen desde ahora; los ya emitidos no cambian.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? "Guardando…" : plan ? "Guardar cambios" : "Crear tarifa"}
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={onDone}>
            <X className="size-4" /> Cancelar
          </Button>
          <FormStatus state={state} />
        </div>
      </form>
    </Tile>
  );
}
