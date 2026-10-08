"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Chip } from "@/components/ui";
import { ATTENDANCE_LABELS } from "@/modules/attendance/labels";
import { checkInAction } from "./actions";

export function CheckInForm({
  slug,
  sessionId,
  token,
  athletes,
}: {
  slug: string;
  sessionId: string;
  token: string;
  athletes: { id: string; name: string; status: string | null }[];
}) {
  const pendingIds = athletes.filter((a) => !a.status).map((a) => a.id);
  const [selected, setSelected] = useState<string[]>(pendingIds);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <ul className="space-y-2" aria-label="Alumnos en la clase">
        {athletes.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            {a.status ? (
              <>
                <CheckCircle2 className="size-5 text-mint" />
                <span className="flex-1 font-semibold">{a.name}</span>
                <Chip tone="mint">{ATTENDANCE_LABELS[a.status as keyof typeof ATTENDANCE_LABELS].long}</Chip>
              </>
            ) : (
              <label className="flex flex-1 items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) =>
                    setSelected((l) => (e.target.checked ? [...l, a.id] : l.filter((x) => x !== a.id)))
                  }
                />
                {a.name}
              </label>
            )}
          </li>
        ))}
      </ul>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {pendingIds.length > 0 && (
        <Button
          className="w-full"
          disabled={pending || selected.length === 0}
          onClick={() =>
            start(async () => {
              const r = await checkInAction(slug, sessionId, token, selected);
              setMessage(
                r.ok
                  ? {
                      tone: "info",
                      text: r.status === "LATE" ? "Llegada registrada (tarde)." : "¡Llegada registrada!",
                    }
                  : { tone: "danger", text: "No se pudo registrar la llegada. Pide ayuda al profesor." },
              );
            })
          }
        >
          Marcar llegada
        </Button>
      )}
    </div>
  );
}
