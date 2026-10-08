"use client";

import { Check, ChevronRight, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Alert, Avatar, Button, Tile, cn } from "@/components/ui";
import { InvitationChip } from "@/modules/invitations/components/invitation-chip";
import type { InvitationState } from "@/modules/invitations/message";
import { shareInvitationAction } from "./actions";

export type PendingGuardian = {
  id: string;
  name: string;
  phone: string;
  athletes: string;
  state: InvitationState;
};

/**
 * COM-03: envío en serie por WhatsApp. Cada clic genera el link de esa persona y abre su chat
 * con el mensaje listo; la persona de la escuela solo toca "Enviar" y vuelve por la siguiente.
 */
export function SerialSender({ slug, people }: { slug: string; people: PendingGuardian[] }) {
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = people[index];

  async function sendCurrent() {
    if (!current) return;
    setBusy(true);
    setError(null);
    // La ventana se abre en el mismo clic (si no, el navegador la bloquea) y luego se dirige al chat.
    const win = window.open("", "_blank");
    const result = await shareInvitationAction(slug, { role: "GUARDIAN", guardianId: current.id });
    setBusy(false);
    if (!result.ok || !result.whatsappUrl) {
      win?.close();
      setError(result.ok ? "Esta persona no tiene celular registrado." : result.message);
      return;
    }
    if (win) win.location.href = result.whatsappUrl;
    else window.location.href = result.whatsappUrl;
    setSent((s) => new Set(s).add(current.id));
  }

  if (people.length === 0) {
    return <Tile className="text-center text-sm text-ink-soft">Todas las familias ya tienen cuenta. 🎉</Tile>;
  }

  return (
    <div className="space-y-4">
      {current ? (
        <Tile className="flex flex-wrap items-center gap-3 border-brand/30 bg-surface ring-4 ring-brand/8">
          <Avatar name={current.name} size={44} />
          <div className="min-w-[10rem] flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {index + 1} de {people.length}
            </p>
            <p className="font-semibold">{current.name}</p>
            <p className="text-sm text-ink-soft">{current.athletes}</p>
          </div>
          {sent.has(current.id) ? (
            <Button variant="secondary" className="h-10" onClick={() => setIndex((i) => i + 1)}>
              Siguiente <ChevronRight className="size-4" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" className="h-10" onClick={() => setIndex((i) => i + 1)}>
                Saltar
              </Button>
              <Button className="h-10 bg-mint hover:bg-mint/90" onClick={sendCurrent} disabled={busy}>
                <MessageCircle className="size-4" /> {busy ? "Abriendo…" : "Enviar por WhatsApp"}
              </Button>
            </div>
          )}
        </Tile>
      ) : (
        <Alert tone="info">
          Terminaste la lista: {sent.size} {sent.size === 1 ? "invitación enviada" : "invitaciones enviadas"}.
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      <ul className="space-y-1.5">
        {people.map((p, i) => (
          <li
            key={p.id}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
              i === index ? "bg-brand/6" : "",
            )}
          >
            <span className="w-6 text-ink-faint">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate">
              <strong>{p.name}</strong> <span className="text-ink-soft">· {p.athletes}</span>
            </span>
            {sent.has(p.id) ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok">
                <Check className="size-3.5" /> Abierto en WhatsApp
              </span>
            ) : (
              <InvitationChip state={p.state} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
