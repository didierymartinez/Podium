"use client";

import { Bandage, Repeat, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { Alert, Button, Card, Field, IconButton, Input, SectionTitle, Select } from "@/components/ui";
import { submitWithoutReset } from "@/components/use-form-action";
import type { ActionState } from "../../action-context";
import { addMakeupAction, removeMakeupAction, reportInjuryAction } from "../actions";

/** Clases de reposición (DEP-24): alumnos de otros grupos que vienen a esta clase. */
export function MakeupCard({
  slug,
  sessionId,
  makeups,
  candidates,
}: {
  slug: string;
  sessionId: string;
  makeups: { athleteId: string; name: string; recorded: boolean }[];
  candidates: { id: string; name: string; groupName: string }[];
}) {
  const [athleteId, setAthleteId] = useState("");
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  return (
    <Card>
      <SectionTitle action={<Repeat className="size-4 text-violet" />}>Reposiciones</SectionTitle>
      {makeups.length > 0 && (
        <ul className="mb-3 space-y-1.5 text-sm" aria-label="Reposiciones">
          {makeups.map((m) => (
            <li key={m.athleteId} className="flex items-center gap-2">
              <span className="flex-1">{m.name}</span>
              {!m.recorded && (
                <IconButton
                  aria-label={`Quitar reposición de ${m.name}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => setState(await removeMakeupAction(slug, sessionId, m.athleteId)))
                  }
                >
                  <X className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Field label="Alumno de otro grupo">
            <Select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
              <option value="">Elige un alumno</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.groupName}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button
          variant="secondary"
          disabled={!athleteId || pending}
          onClick={() =>
            start(async () => {
              const result = await addMakeupAction(slug, sessionId, athleteId);
              setState(result);
              if (result.ok) setAthleteId("");
            })
          }
        >
          Agregar reposición
        </Button>
      </div>
      <div className="mt-2">
        <FormStatus state={state} />
      </div>
    </Card>
  );
}

/** Novedad médica desde la clase (DEP-72): queda como restricción visible hasta el alta. */
export function InjuryCard({
  slug,
  sessionId,
  athletes,
  today,
}: {
  slug: string;
  sessionId: string;
  athletes: { id: string; name: string }[];
  today: string;
}) {
  const [state, dispatch, pending] = useActionState(
    reportInjuryAction.bind(null, slug, sessionId),
    {} as ActionState,
  );
  const err = (k: string) => state.errors?.[k]?.[0];
  return (
    <Card>
      <SectionTitle action={<Bandage className="size-4 text-danger" />}>Reportar novedad médica</SectionTitle>
      <form onSubmit={submitWithoutReset(dispatch)} className="grid gap-3 sm:grid-cols-2">
        <Field label="Alumno" error={err("athleteId")}>
          <Select name="athleteId" defaultValue="">
            <option value="" disabled>
              Elige un alumno
            </option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha" error={err("occurredOn")}>
          <Input name="occurredOn" type="date" defaultValue={today} max={today} />
        </Field>
        <Field label="Novedad" error={err("kind")}>
          <Input name="kind" placeholder="Esguince de tobillo" maxLength={80} />
        </Field>
        <Field label="Restricción" error={err("restriction")}>
          <Input name="restriction" placeholder="No saltos por 2 semanas" maxLength={160} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="secondary" disabled={pending}>
            Registrar novedad
          </Button>
          <FormStatus state={state} />
        </div>
        {state.ok === false && !state.errors && state.message && (
          <div className="sm:col-span-2">
            <Alert>{state.message}</Alert>
          </div>
        )}
      </form>
    </Card>
  );
}
