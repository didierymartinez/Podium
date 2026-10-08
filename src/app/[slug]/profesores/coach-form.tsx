"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, Select, buttonClass } from "@/components/ui";
import { DOCUMENT_TYPE_LABELS } from "@/modules/athletes/schemas";
import type { ActionState } from "../action-context";
import { saveCoachAction } from "./actions";

export type CoachValues = {
  id?: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  email: string;
  specialty: string;
  hiredOn: string;
};

export function CoachForm({ slug, initial }: { slug: string; initial: CoachValues }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveCoachAction.bind(null, slug),
    {},
  );
  const error = (key: string) => state.errors?.[key]?.[0];
  return (
    <form onSubmit={submitWithoutReset(action)}>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <fieldset disabled={pending}>
        <Card className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombres" error={error("firstName")}>
              <Input name="firstName" defaultValue={initial.firstName} required maxLength={60} />
            </Field>
            <Field label="Apellidos" error={error("lastName")}>
              <Input name="lastName" defaultValue={initial.lastName} required maxLength={60} />
            </Field>
            <Field label="Celular (WhatsApp)" hint="Para invitarlo y enviarle avisos" error={error("phone")}>
              <Input name="phone" type="tel" defaultValue={initial.phone} required />
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
            <Field
              label="Especialidad"
              hint="Ej.: velocidad, artístico, preparación física"
              error={error("specialty")}
            >
              <Input name="specialty" defaultValue={initial.specialty} maxLength={80} />
            </Field>
            <Field label="Fecha de vinculación" error={error("hiredOn")}>
              <Input name="hiredOn" type="date" defaultValue={initial.hiredOn} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit">
              {pending ? "Guardando…" : initial.id ? "Guardar cambios" : "Crear profesor"}
            </Button>
            <Link href={`/${slug}/profesores`} className={buttonClass("ghost")}>
              Cancelar
            </Link>
            <FormStatus state={state} />
          </div>
        </Card>
      </fieldset>
    </form>
  );
}
