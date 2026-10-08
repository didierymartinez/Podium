"use client";

import { Ban, RotateCcw } from "lucide-react";
import { useActionState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle } from "@/components/ui";
import type { ActionState } from "../../action-context";
import { cancelSessionAction, restoreSessionAction } from "../actions";

export function CancelPanel({
  slug,
  sessionId,
  canceled,
  reason,
}: {
  slug: string;
  sessionId: string;
  canceled: boolean;
  reason: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    cancelSessionAction.bind(null, slug, sessionId),
    {},
  );
  const [restoring, startTransition] = useTransition();

  if (canceled) {
    return (
      <Card>
        <SectionTitle>Clase cancelada</SectionTitle>
        <p className="mb-4 text-sm text-ink-soft">Motivo: {reason ?? "sin motivo"}.</p>
        <Button
          variant="secondary"
          disabled={restoring}
          onClick={() => startTransition(() => void restoreSessionAction(slug, sessionId))}
        >
          <RotateCcw className="size-4" /> Restablecer clase
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Cancelar esta clase</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Por lluvia, un festivo sin clase o un torneo. La clase queda en el historial y no cuenta en el % de
        asistencia.
      </p>
      <form onSubmit={submitWithoutReset(action)} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <Field label="Motivo" error={state.errors?.reason?.[0]}>
            <Input name="reason" required maxLength={120} placeholder="Lluvia" />
          </Field>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          <Ban className="size-4" /> {pending ? "Cancelando…" : "Cancelar clase"}
        </Button>
        <FormStatus state={state} />
      </form>
    </Card>
  );
}
