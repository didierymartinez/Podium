"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { Button, Field, Input } from "@/components/ui";
import { submitWithoutReset } from "@/components/use-form-action";
import type { ActionState } from "../../action-context";
import { launchReenrollmentAction } from "../actions";

export function LaunchCampaignForm({
  slug,
  year,
  amount,
  dueOn,
}: {
  slug: string;
  year: number;
  amount: number;
  dueOn: string;
}) {
  const [state, dispatch, pending] = useActionState(
    launchReenrollmentAction.bind(null, slug),
    {} as ActionState,
  );
  return (
    <form onSubmit={submitWithoutReset(dispatch)} className="grid gap-3 sm:grid-cols-3">
      <Field label="Año">
        <Input name="year" type="number" min={2024} max={2100} defaultValue={year} required />
      </Field>
      <Field label="Valor de la re-matrícula" hint="0 = solo confirmar datos">
        <MoneyInput name="amount" defaultValue={amount} />
      </Field>
      <Field label="Vence">
        <Input name="dueOn" type="date" defaultValue={dueOn} required />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Generando…" : "Lanzar re-matrícula"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
