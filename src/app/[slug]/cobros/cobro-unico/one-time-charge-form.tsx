"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle, Select } from "@/components/ui";
import type { ActionState } from "../../action-context";
import { oneTimeChargeAction } from "../actions";

type Group = { id: string; name: string; members: { id: string; name: string }[] };

export function OneTimeChargeForm({
  slug,
  dueOn,
  concepts,
  groups,
}: {
  slug: string;
  dueOn: string;
  concepts: { id: string; name: string; amount: number | null }[];
  groups: Group[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    oneTimeChargeAction.bind(null, slug),
    {},
  );
  const [description, setDescription] = useState("");
  const [amountKey, setAmountKey] = useState(0);
  const [defaultAmount, setDefaultAmount] = useState<number | undefined>();
  const [picked, setPicked] = useState<string[]>([]);
  const error = (k: string) => state.errors?.[k]?.[0];
  const toggle = (id: string, on: boolean) =>
    setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)));

  return (
    <form onSubmit={submitWithoutReset(action)}>
      {picked.map((id) => (
        <input key={id} type="hidden" name="athleteIds" value={id} />
      ))}
      <fieldset disabled={pending} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="space-y-4">
          {concepts.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Conceptos">
              {concepts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setDescription(c.name);
                    setDefaultAmount(c.amount ?? undefined);
                    setAmountKey((k) => k + 1);
                  }}
                  className="h-9 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink-soft hover:text-ink"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <Field label="Concepto" error={error("description")}>
            <Input
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Valor por alumno" error={error("amount")}>
              <MoneyInput key={amountKey} name="amount" defaultValue={defaultAmount} required />
            </Field>
            <Field label="Vence" error={error("dueOn")}>
              <Input type="date" name="dueOn" defaultValue={dueOn} required />
            </Field>
            <Field label="Tipo">
              <Select name="kind" defaultValue="ONE_TIME">
                <option value="ONE_TIME">Cobro único</option>
                <option value="PREVIOUS_BALANCE">Saldo anterior</option>
              </Select>
            </Field>
          </div>
          {error("athleteIds") && <p className="text-sm text-danger">{error("athleteIds")}</p>}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit">
              {pending
                ? "Creando…"
                : `Cobrar a ${picked.length} ${picked.length === 1 ? "alumno" : "alumnos"}`}
            </Button>
            <FormStatus state={state} />
          </div>
        </Card>
        <Card className="space-y-3 lg:self-start">
          <SectionTitle>Alumnos</SectionTitle>
          <ul className="max-h-[28rem] space-y-3 overflow-y-auto" aria-label="Alumnos por grupo">
            {groups.map((g) => (
              <li key={g.id}>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand"
                    checked={g.members.length > 0 && g.members.every((m) => picked.includes(m.id))}
                    onChange={(e) => g.members.forEach((m) => toggle(m.id, e.target.checked))}
                  />
                  {g.name} ({g.members.length})
                </label>
                <ul className="ml-6 mt-1 space-y-0.5">
                  {g.members.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-brand"
                          checked={picked.includes(m.id)}
                          onChange={(e) => toggle(m.id, e.target.checked)}
                        />
                        {m.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      </fieldset>
    </form>
  );
}
