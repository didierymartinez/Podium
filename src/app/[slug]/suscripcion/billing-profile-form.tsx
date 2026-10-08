"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { Button, Field, Input, Select } from "@/components/ui";
import { submitWithoutReset } from "@/components/use-form-action";
import type { ActionState } from "../action-context";
import { saveBillingProfileAction } from "./actions";

export type BillingProfileValues = {
  legalName: string;
  documentType: string;
  documentNumber: string;
  address: string;
  billingEmail: string;
};

export function BillingProfileForm({ slug, initial }: { slug: string; initial: BillingProfileValues }) {
  const [state, dispatch, pending] = useActionState(
    saveBillingProfileAction.bind(null, slug),
    {} as ActionState,
  );
  const err = (k: keyof BillingProfileValues) => state.errors?.[k]?.[0];
  return (
    <form onSubmit={submitWithoutReset(dispatch)} className="grid gap-3 sm:grid-cols-2">
      <Field label="Razón social o nombre" error={err("legalName")}>
        <Input name="legalName" defaultValue={initial.legalName} required maxLength={120} />
      </Field>
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <Field label="Documento" error={err("documentType")}>
          <Select name="documentType" defaultValue={initial.documentType || "NIT"}>
            <option value="NIT">NIT</option>
            <option value="CC">CC</option>
            <option value="CE">CE</option>
          </Select>
        </Field>
        <Field label="Número" error={err("documentNumber")}>
          <Input name="documentNumber" defaultValue={initial.documentNumber} required inputMode="numeric" />
        </Field>
      </div>
      <Field label="Dirección" error={err("address")}>
        <Input name="address" defaultValue={initial.address} required maxLength={160} />
      </Field>
      <Field label="Email de facturación" error={err("billingEmail")}>
        <Input name="billingEmail" type="email" defaultValue={initial.billingEmail} required />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar datos de facturación"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
