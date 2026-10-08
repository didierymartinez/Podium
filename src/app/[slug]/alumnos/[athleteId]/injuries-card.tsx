"use client";

import { Bandage } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { Button, Card, Chip, Field, Input, SectionTitle } from "@/components/ui";
import { submitWithoutReset } from "@/components/use-form-action";
import type { ActionState } from "../../action-context";
import { addInjuryAction, clearInjuryAction } from "../actions";

export type InjuryView = {
  id: string;
  kind: string;
  occurredOn: string;
  restriction: string;
  clearedOn: string | null;
  active: boolean;
};

/** Novedades médicas y lesiones del alumno (DEP-72). */
export function InjuriesCard({
  slug,
  athleteId,
  today,
  injuries,
}: {
  slug: string;
  athleteId: string;
  today: string;
  injuries: InjuryView[];
}) {
  const [adding, setAdding] = useState(false);
  const [state, dispatch, pending] = useActionState(
    addInjuryAction.bind(null, slug, athleteId),
    {} as ActionState,
  );
  const [clearing, start] = useTransition();
  const err = (k: string) => state.errors?.[k]?.[0];
  return (
    <Card>
      <SectionTitle
        action={
          <Button variant="secondary" className="h-9" onClick={() => setAdding((v) => !v)}>
            <Bandage className="size-4" /> Novedad
          </Button>
        }
      >
        Lesiones y restricciones
      </SectionTitle>
      <ul className="space-y-2 text-sm" aria-label="Lesiones y restricciones">
        {injuries.map((i) => (
          <li key={i.id} className="rounded-2xl bg-canvas px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 font-semibold">{i.kind}</span>
              {i.active ? <Chip tone="danger">Vigente</Chip> : <Chip>Alta {i.clearedOn}</Chip>}
            </div>
            <p className="text-ink-soft">
              {i.occurredOn} · {i.restriction}
            </p>
            {i.active && (
              <Button
                variant="ghost"
                className="mt-1 h-8 px-2"
                disabled={clearing}
                onClick={() => start(async () => void (await clearInjuryAction(slug, athleteId, i.id)))}
              >
                Dar de alta hoy
              </Button>
            )}
          </li>
        ))}
        {injuries.length === 0 && <li className="text-ink-soft">Sin novedades médicas.</li>}
      </ul>
      {adding && (
        <form
          onSubmit={submitWithoutReset(dispatch)}
          className="mt-3 grid gap-2 rounded-2xl border border-line p-3"
        >
          <Field label="Novedad" error={err("kind")}>
            <Input name="kind" placeholder="Esguince de tobillo" maxLength={80} />
          </Field>
          <Field label="Restricción" error={err("restriction")}>
            <Input name="restriction" placeholder="No saltos por 2 semanas" maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fecha" error={err("occurredOn")}>
              <Input name="occurredOn" type="date" defaultValue={today} />
            </Field>
            <Field label="Alta prevista (opcional)" error={err("clearedOn")}>
              <Input name="clearedOn" type="date" />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              Guardar novedad
            </Button>
            <FormStatus state={state} />
          </div>
        </form>
      )}
    </Card>
  );
}
