"use client";

import { Ban } from "lucide-react";
import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle } from "@/components/ui";
import type { ActionState } from "../../../action-context";
import { voidPaymentAction } from "../../actions";

export function VoidPaymentCard({ slug, paymentId }: { slug: string; paymentId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    voidPaymentAction.bind(null, slug, paymentId),
    {},
  );
  return (
    <Card className="lg:self-start">
      <SectionTitle action={<Ban className="size-4 text-ink-faint" />}>Anular pago</SectionTitle>
      <p className="-mt-2 mb-3 text-sm text-ink-soft">
        Revierte su aplicación a las cuentas. Queda en la auditoría.
      </p>
      <form onSubmit={submitWithoutReset(action)} className="space-y-3">
        <Field label="Motivo" error={state.errors?.reason?.[0]}>
          <Input name="reason" required maxLength={160} placeholder="Transferencia rechazada" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary" disabled={pending}>
            Anular pago
          </Button>
          <FormStatus state={state} />
        </div>
      </form>
    </Card>
  );
}
