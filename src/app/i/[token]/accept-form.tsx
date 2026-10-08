"use client";

import { useActionState } from "react";
import { submitWithoutReset } from "@/components/use-form-action";
import { Alert, Button } from "@/components/ui";
import { acceptInvitationAction } from "./actions";

export function AcceptInvitationForm({ token, schoolName }: { token: string; schoolName: string }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(
    acceptInvitationAction.bind(null, token),
    {},
  );
  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-4">
      <label className="flex items-start gap-2.5 text-sm text-ink-soft">
        <input type="checkbox" name="dataConsent" className="mt-0.5 size-4 shrink-0 accent-brand" required />
        <span>
          Autorizo a <strong className="text-ink">{schoolName}</strong> a tratar mis datos y los de las
          personas a mi cargo para la gestión deportiva y administrativa, según la ley 1581 de 2012.
        </span>
      </label>
      <label className="flex items-start gap-2.5 text-sm text-ink-soft">
        <input
          type="checkbox"
          name="whatsappConsent"
          className="mt-0.5 size-4 shrink-0 accent-brand"
          defaultChecked
        />
        <span>Acepto recibir avisos y recordatorios por WhatsApp. Puedo darme de baja cuando quiera.</span>
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Un momento…" : "Aceptar invitación"}
      </Button>
    </form>
  );
}
