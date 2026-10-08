"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import { acceptLegalAction } from "./actions";

export function AcceptForm() {
  const [state, dispatch, pending] = useActionState(acceptLegalAction, {});
  return (
    <form action={dispatch} className="space-y-4">
      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="accept" className="mt-0.5 size-4 shrink-0 accent-brand" />
        <span>
          Acepto los términos del servicio y autorizo el tratamiento de mis datos según la política.
        </span>
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" className="w-full" disabled={pending}>
        Aceptar y continuar
      </Button>
    </form>
  );
}
