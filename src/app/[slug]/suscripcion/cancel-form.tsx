"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { Button, Field, Input, Select } from "@/components/ui";
import { submitWithoutReset } from "@/components/use-form-action";
import type { ActionState } from "../action-context";
import { cancelSubscriptionAction } from "./actions";

const REASONS = [
  "Es muy caro",
  "No lo estamos usando",
  "Nos falta una función",
  "Cerramos la escuela",
  "Otro",
];

export function CancelForm({ slug, exportHref }: { slug: string; exportHref: string }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(
    cancelSubscriptionAction.bind(null, slug),
    {} as ActionState,
  );
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Cancelar suscripción
      </Button>
    );
  return (
    <form onSubmit={submitWithoutReset(dispatch)} className="space-y-3">
      <p className="text-sm text-ink-soft">
        Antes de cancelar puedes{" "}
        <a href={exportHref} className="font-semibold text-brand" download>
          descargar todos tus datos
        </a>
        . Conservamos la información 90 días por si vuelves.
      </p>
      <Field label="¿Por qué cancelas?" error={state.errors?.reason?.[0]}>
        <Select name="reason" defaultValue="">
          <option value="" disabled>
            Elige un motivo
          </option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Comentarios (opcional)">
        <Input name="details" maxLength={300} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Cancelando…" : "Confirmar cancelación"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
