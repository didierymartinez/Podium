"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Chip, Input } from "@/components/ui";
import type { ActionState } from "../action-context";
import { reportExcuseAction, withdrawExcuseAction } from "./actions";

export type UpcomingView = {
  sessionId: string;
  label: string;
  groupName: string;
  familyReported: boolean;
  recorded: boolean;
};

/** Próximas clases con el botón para avisar que no asistirá (DEP-23). */
export function UpcomingClasses({
  slug,
  athleteId,
  firstName,
  classes,
}: {
  slug: string;
  athleteId: string;
  firstName: string;
  classes: UpcomingView[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  if (classes.length === 0)
    return <p className="text-sm text-ink-soft">No hay clases en los próximos 7 días.</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5 text-sm" aria-label={`Próximas clases de ${firstName}`}>
        {classes.map((c) => (
          <li key={c.sessionId} data-session-id={c.sessionId} className="rounded-xl bg-canvas px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 capitalize">
                {c.label} · <span className="text-ink-soft">{c.groupName}</span>
              </span>
              {c.familyReported ? (
                <>
                  <Chip tone="violet">Avisaste que no asiste</Chip>
                  <Button
                    variant="ghost"
                    className="h-8 px-2"
                    disabled={pending}
                    onClick={() =>
                      start(async () =>
                        setState(await withdrawExcuseAction(slug, { sessionId: c.sessionId, athleteId })),
                      )
                    }
                  >
                    Retirar aviso
                  </Button>
                </>
              ) : c.recorded ? null : (
                <Button
                  variant="secondary"
                  className="h-8 px-3"
                  onClick={() => setOpen(open === c.sessionId ? null : c.sessionId)}
                >
                  No asistirá
                </Button>
              )}
            </div>
            {open === c.sessionId && (
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    const result = await reportExcuseAction(slug, {
                      sessionId: c.sessionId,
                      athleteId,
                      reason,
                    });
                    setState(result);
                    if (result.ok) {
                      setOpen(null);
                      setReason("");
                    }
                  });
                }}
              >
                <Input
                  aria-label="Motivo"
                  placeholder="Motivo (cita médica, viaje…)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={120}
                  className="h-9 flex-1"
                />
                <Button type="submit" className="h-9" disabled={pending}>
                  Avisar
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {state.message && <Alert tone={state.ok ? "info" : "danger"}>{state.message}</Alert>}
    </div>
  );
}
