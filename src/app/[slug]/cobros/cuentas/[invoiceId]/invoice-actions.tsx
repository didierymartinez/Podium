"use client";

import { Ban, BadgePercent, RefreshCw } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle } from "@/components/ui";
import type { ActionState } from "../../../action-context";
import { creditNoteAction, regenerateInvoiceAction, voidInvoiceAction } from "../../actions";

export function InvoiceActions({
  slug,
  invoiceId,
  balance,
  canAdmin,
  canRegenerate,
}: {
  slug: string;
  invoiceId: string;
  balance: number;
  canAdmin: boolean;
  canRegenerate: boolean;
}) {
  const [credit, creditAction, creditPending] = useActionState<ActionState, FormData>(
    creditNoteAction.bind(null, slug, invoiceId),
    {},
  );
  const [voided, voidAction, voidPending] = useActionState<ActionState, FormData>(
    voidInvoiceAction.bind(null, slug, invoiceId),
    {},
  );
  const [regen, setRegen] = useState<ActionState>({});
  const [regenerating, startRegen] = useTransition();

  return (
    <>
      {canAdmin && balance > 0 && (
        <Card>
          <SectionTitle action={<BadgePercent className="size-4 text-ink-faint" />}>
            Nota crédito
          </SectionTitle>
          <p className="-mt-2 mb-3 text-sm text-ink-soft">
            Descuenta un valor con motivo. La cuenta no se edita.
          </p>
          <form onSubmit={submitWithoutReset(creditAction)} className="space-y-3">
            <Field label="Valor" error={credit.errors?.amount?.[0]}>
              <MoneyInput name="amount" required />
            </Field>
            <Field label="Motivo" error={credit.errors?.reason?.[0]}>
              <Input name="reason" required maxLength={160} placeholder="Beca parcial de octubre" />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="secondary" disabled={creditPending}>
                Registrar nota crédito
              </Button>
              <FormStatus state={credit} />
            </div>
          </form>
        </Card>
      )}
      {canRegenerate && (
        <Card>
          <SectionTitle action={<RefreshCw className="size-4 text-ink-faint" />}>Regenerar</SectionTitle>
          <p className="-mt-2 mb-3 text-sm text-ink-soft">
            Si corregiste una matrícula o una tarifa, anula esta cuenta y genérala de nuevo con los datos
            actuales.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={regenerating}
              onClick={() =>
                startRegen(async () => setRegen((await regenerateInvoiceAction(slug, invoiceId)) ?? {}))
              }
            >
              Regenerar cuenta
            </Button>
            <FormStatus state={regen} />
          </div>
        </Card>
      )}
      {canAdmin && (
        <Card>
          <SectionTitle action={<Ban className="size-4 text-ink-faint" />}>Anular</SectionTitle>
          <p className="-mt-2 mb-3 text-sm text-ink-soft">
            Los pagos aplicados vuelven a ser saldo a favor del acudiente. Queda en la auditoría.
          </p>
          <form onSubmit={submitWithoutReset(voidAction)} className="space-y-3">
            <Field label="Motivo" error={voided.errors?.reason?.[0]}>
              <Input name="reason" required maxLength={160} placeholder="Se cobró por error" />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="secondary" disabled={voidPending}>
                Anular cuenta
              </Button>
              <FormStatus state={voided} />
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
