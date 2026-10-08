"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, IconButton } from "@/components/ui";
import { inviteAction, removeInvitationAction } from "../actions";

/** Convocatoria con validaciones (DEP-61). */
export function InvitePanel({
  slug,
  competitionId,
  events,
  candidates,
}: {
  slug: string;
  competitionId: string;
  events: string[];
  candidates: { id: string; name: string; issues: string[]; invited: boolean }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>(events.length === 1 ? events : []);
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (list: string[], v: string, on: boolean) =>
    on ? [...list, v] : list.filter((x) => x !== v);

  function invite() {
    if (!selected.length || !chosen.length) {
      setMessage({ tone: "danger", text: "Elige alumnos y al menos una prueba." });
      return;
    }
    start(async () => {
      const r = await inviteAction(slug, competitionId, { athleteIds: selected, events: chosen, force });
      if (!r.ok) {
        setMessage({
          tone: "danger",
          text: r.error === "closed" ? "Las inscripciones ya cerraron." : "No se pudo convocar.",
        });
        return;
      }
      setSelected([]);
      setMessage({
        tone: r.skipped.length ? "danger" : "info",
        text:
          `${r.invited} convocados; las familias recibieron el aviso.` +
          (r.skipped.length
            ? ` Sin convocar por requisitos: ${r.skipped.map((s) => `${s.name} (${s.issues.join(", ")})`).join("; ")}.`
            : ""),
      });
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line" aria-label="Alumnos para convocar">
        {candidates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
            <label className="flex flex-1 items-center gap-2">
              <input
                type="checkbox"
                disabled={c.invited}
                checked={selected.includes(c.id)}
                onChange={(e) => setSelected((l) => toggle(l, c.id, e.target.checked))}
              />
              <span className="font-semibold">{c.name}</span>
            </label>
            {c.invited ? (
              <span className="text-ink-soft">Ya convocado</span>
            ) : c.issues.length ? (
              <span className="text-danger">{c.issues.join(" · ")}</span>
            ) : (
              <span className="text-mint">Cumple requisitos</span>
            )}
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="py-2 text-sm text-ink-soft">El grupo no tiene alumnos.</li>
        )}
      </ul>
      <fieldset>
        <legend className="text-sm font-semibold">Pruebas</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          {events.map((ev) => (
            <label key={ev} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={chosen.includes(ev)}
                onChange={(e) => setChosen((l) => toggle(l, ev, e.target.checked))}
              />
              {ev}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
        Convocar también a quienes tienen observaciones
      </label>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button onClick={invite} disabled={pending}>
        Convocar
      </Button>
    </div>
  );
}

export function RemoveInvitationButton({
  slug,
  entryId,
  name,
}: {
  slug: string;
  entryId: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  return (
    <IconButton
      aria-label={`Retirar convocatoria de ${name}`}
      disabled={pending}
      onClick={() => start(async () => void (await removeInvitationAction(slug, entryId)))}
    >
      <X className="size-4" />
    </IconButton>
  );
}
