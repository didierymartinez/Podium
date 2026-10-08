"use client";

import { Rocket } from "lucide-react";
import { useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { Button } from "@/components/ui";
import type { ActionState } from "../context";
import { setCommsAction } from "../actions";

export function CommsToggle({ slug, active, canEdit }: { slug: string; active: boolean; canEdit: boolean }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  if (!canEdit) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {active ? (
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(async () => setState(await setCommsAction(slug, false)))}
        >
          Pausar comunicaciones
        </Button>
      ) : (
        <Button
          disabled={pending}
          onClick={() => startTransition(async () => setState(await setCommsAction(slug, true)))}
        >
          <Rocket className="size-4" /> Activar comunicaciones y cobros
        </Button>
      )}
      <FormStatus state={state} />
    </div>
  );
}
