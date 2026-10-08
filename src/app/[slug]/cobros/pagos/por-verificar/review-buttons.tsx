"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Input } from "@/components/ui";
import type { ActionState } from "../../../action-context";
import { approveTransferAction, rejectTransferAction } from "../../actions";

export function ReviewButtons({ slug, reportId }: { slug: string; reportId: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {rejecting ? (
        <>
          <Input
            aria-label="Motivo del rechazo"
            placeholder="No aparece en el banco…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 w-56"
          />
          <Button
            variant="danger"
            className="h-9"
            disabled={pending || reason.trim().length < 3}
            onClick={() => start(async () => setState(await rejectTransferAction(slug, reportId, reason)))}
          >
            Rechazar
          </Button>
        </>
      ) : (
        <>
          <Button
            className="h-9"
            disabled={pending}
            onClick={() => start(async () => setState(await approveTransferAction(slug, reportId)))}
          >
            Aprobar
          </Button>
          <Button variant="ghost" className="h-9" onClick={() => setRejecting(true)}>
            Rechazar…
          </Button>
        </>
      )}
      {state.ok === false && state.message && <Alert>{state.message}</Alert>}
    </div>
  );
}
