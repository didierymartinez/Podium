"use client";

import { Landmark } from "lucide-react";
import { useActionState, useState } from "react";
import { AttachedFileField } from "@/components/attached-file-field";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { Button, Field, Input, Select } from "@/components/ui";
import { submitWithoutReset } from "@/components/use-form-action";
import { formatCOP } from "@/lib/money";
import type { ActionState } from "../action-context";
import { reportTransferAction } from "./actions";

/** "Ya pagué por transferencia": la familia reporta el pago con su soporte (ADM-34). */
export function ReportTransfer({
  slug,
  today,
  invoices,
}: {
  slug: string;
  today: string;
  invoices: { id: string; label: string; balance: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(reportTransferAction.bind(null, slug), {} as ActionState);
  if (!open)
    return (
      <div className="space-y-2">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Landmark className="size-4" /> Ya pagué por transferencia o consignación
        </Button>
        <FormStatus state={state} />
      </div>
    );
  return (
    <form
      onSubmit={submitWithoutReset(dispatch)}
      className="grid gap-3 sm:grid-cols-2"
      aria-label="Reportar pago"
    >
      <Field label="Valor pagado" error={state.errors?.amount?.[0]}>
        <MoneyInput name="amount" defaultValue={invoices.reduce((s, i) => s + i.balance, 0)} />
      </Field>
      <Field label="Fecha del pago">
        <Input name="paidOn" type="date" defaultValue={today} max={today} required />
      </Field>
      <Field label="Medio">
        <Select name="method" defaultValue="TRANSFER">
          <option value="TRANSFER">Transferencia</option>
          <option value="DEPOSIT">Consignación</option>
        </Select>
      </Field>
      <Field label="Referencia o número de aprobación">
        <Input name="reference" maxLength={80} />
      </Field>
      {invoices.length > 0 && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold">Cuentas que pagas</legend>
          {invoices.map((i) => (
            <label key={i.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="invoiceIds"
                value={i.id}
                defaultChecked
                className="size-4 accent-brand"
              />
              {i.label} · {formatCOP(i.balance)}
            </label>
          ))}
        </fieldset>
      )}
      <div className="sm:col-span-2">
        <AttachedFileField slug={slug} kind="PAYMENT_PROOF" name="proofFileId" label="Adjuntar soporte" />
        {state.errors?.proofFileId && <p className="text-sm text-danger">{state.errors.proofFileId[0]}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Enviar reporte"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
