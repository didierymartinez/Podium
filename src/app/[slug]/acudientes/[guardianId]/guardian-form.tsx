"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle, Select } from "@/components/ui";
import { DOCUMENT_TYPE_LABELS } from "@/modules/athletes/schemas";
import type { ActionState } from "../../action-context";
import { updateGuardianAction } from "../actions";

export type GuardianValues = {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  email: string;
};

export function GuardianForm({
  slug,
  guardianId,
  initial,
}: {
  slug: string;
  guardianId: string;
  initial: GuardianValues;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateGuardianAction.bind(null, slug, guardianId),
    {},
  );
  const [phone, setPhone] = useState(initial.phone);
  const [applied, setApplied] = useState(state);
  if (applied !== state) {
    setApplied(state);
    if (state.ok && state.values?.phone) setPhone(state.values.phone);
  }
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <form onSubmit={submitWithoutReset(action)}>
      <fieldset disabled={pending}>
        <Card className="space-y-5">
          <SectionTitle>Datos del acudiente</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombres" error={error("firstName")}>
              <Input name="firstName" defaultValue={initial.firstName} required maxLength={60} />
            </Field>
            <Field label="Apellidos" error={error("lastName")}>
              <Input name="lastName" defaultValue={initial.lastName} required maxLength={60} />
            </Field>
            <Field label="Celular (WhatsApp)" hint="Único por escuela" error={error("phone")}>
              <Input
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </Field>
            <Field label="Email" error={error("email")}>
              <Input name="email" type="email" defaultValue={initial.email} maxLength={120} />
            </Field>
            <Field label="Tipo de documento" error={error("documentType")}>
              <Select name="documentType" defaultValue={initial.documentType}>
                {(["CC", "CE", "PPT", "PASSPORT"] as const).map((t) => (
                  <option key={t} value={t}>
                    {DOCUMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Número de documento" error={error("documentNumber")}>
              <Input name="documentNumber" defaultValue={initial.documentNumber} maxLength={20} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit">{pending ? "Guardando…" : "Guardar cambios"}</Button>
            <FormStatus state={state} />
          </div>
        </Card>
      </fieldset>
    </form>
  );
}
