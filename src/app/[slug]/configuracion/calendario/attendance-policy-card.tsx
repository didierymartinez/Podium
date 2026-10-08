"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle } from "@/components/ui";
import type { AttendancePolicy } from "@/modules/attendance/alerts";
import { updateAttendancePolicyAction } from "../actions";
import type { ActionState } from "../context";

export function AttendancePolicyCard({
  slug,
  canEdit,
  policy,
}: {
  slug: string;
  canEdit: boolean;
  policy: AttendancePolicy;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateAttendancePolicyAction.bind(null, slug),
    {},
  );
  const error = (k: string) => state.errors?.[k]?.[0];
  return (
    <Card>
      <SectionTitle>Alertas de deserción</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Avisamos a la administración cuando un alumno activo cumple alguna de estas condiciones.
      </p>
      <form onSubmit={submitWithoutReset(action)}>
        <fieldset disabled={!canEdit || pending} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ausencias seguidas" error={error("consecutiveAbsences")}>
              <Input
                type="number"
                name="consecutiveAbsences"
                min={2}
                max={10}
                defaultValue={policy.consecutiveAbsences}
              />
            </Field>
            <Field label="Asistencia mínima del mes (%)" error={error("minMonthlyRate")}>
              <Input
                type="number"
                name="minMonthlyRate"
                min={10}
                max={100}
                defaultValue={policy.minMonthlyRate}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="secondary" className="h-10">
              {pending ? "Guardando…" : "Guardar alertas"}
            </Button>
            <FormStatus state={state} />
          </div>
        </fieldset>
      </form>
    </Card>
  );
}
