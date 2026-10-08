"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { Button } from "@/components/ui";
import type { ActionState } from "../../action-context";
import { generateMonthAction } from "../actions";

export function GenerateButton({
  slug,
  period,
  disabled,
}: {
  slug: string;
  period: string;
  disabled: boolean;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <FormStatus state={state} />
      <Button
        disabled={disabled || pending}
        onClick={() => startTransition(async () => setState(await generateMonthAction(slug, period)))}
      >
        <Sparkles className="size-4" /> {pending ? "Generando…" : "Generar cuentas"}
      </Button>
    </div>
  );
}
