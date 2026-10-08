"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { Button, Field, Input } from "@/components/ui";
import { submitWithoutReset } from "@/components/use-form-action";
import { formatCOP } from "@/lib/money";
import type { ActionState } from "../../action-context";
import { closeCashAction } from "../actions";

export function CloseCashForm({ slug, expectedCash }: { slug: string; expectedCash: number }) {
  const [state, dispatch, pending] = useActionState(closeCashAction.bind(null, slug), {} as ActionState);
  const [counted, setCounted] = useState(expectedCash);
  const difference = counted - expectedCash;
  return (
    <form
      onSubmit={submitWithoutReset(dispatch)}
      className="grid gap-3 sm:grid-cols-2"
      aria-label="Cerrar caja"
    >
      <Field label="Efectivo contado" error={state.errors?.countedCash?.[0]}>
        <MoneyInput name="countedCash" defaultValue={expectedCash} onValueChange={setCounted} />
      </Field>
      <div className="self-end pb-2 text-sm">
        Esperado {formatCOP(expectedCash)} · diferencia{" "}
        <strong className={difference < 0 ? "text-danger" : undefined}>{formatCOP(difference)}</strong>
      </div>
      <div className="sm:col-span-2">
        <Field label="Observación" error={state.errors?.notes?.[0]}>
          <Input
            name="notes"
            maxLength={300}
            placeholder={difference ? "Explica la diferencia" : "Opcional"}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          Cerrar caja
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
