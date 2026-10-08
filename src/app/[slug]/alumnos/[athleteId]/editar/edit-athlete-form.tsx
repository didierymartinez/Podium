"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, buttonClass } from "@/components/ui";
import type { ActionState } from "../../../action-context";
import { updateAthleteAction } from "../../actions";
import { AthleteFields, type AthleteValues } from "../../athlete-fields";

export function EditAthleteForm({
  slug,
  athleteId,
  initial,
}: {
  slug: string;
  athleteId: string;
  initial: AthleteValues;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateAthleteAction.bind(null, slug, athleteId),
    {},
  );
  return (
    <form onSubmit={submitWithoutReset(action)}>
      <fieldset disabled={pending} className="space-y-4">
        <Card className="space-y-6">
          <AthleteFields initial={initial} errors={state.errors} />
        </Card>
        <div className="flex flex-wrap items-center gap-3 px-1">
          <Button type="submit">{pending ? "Guardando…" : "Guardar cambios"}</Button>
          <Link href={`/${slug}/alumnos/${athleteId}`} className={buttonClass("ghost")}>
            Cancelar
          </Link>
          <FormStatus state={state} />
        </div>
      </fieldset>
    </form>
  );
}
