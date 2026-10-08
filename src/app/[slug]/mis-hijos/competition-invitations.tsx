"use client";

import { Trophy } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Chip, SectionTitle } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { ENTRY_STATUS_LABELS } from "@/modules/competitions/labels";
import { respondInvitationAction } from "../competencias/actions";

type Invitation = {
  entryId: string;
  firstName: string;
  status: keyof typeof ENTRY_STATUS_LABELS;
  events: string[];
  chosenExtras: string[];
  competition: {
    name: string;
    dates: string;
    place: string;
    deadline: string;
    open: boolean;
    entryFee: number;
    extras: { name: string; amount: number }[];
    authorizationText: string;
    notes: string | null;
  };
};

/** Convocatorias: aceptar con autorización digital (DEP-62) y servicios opcionales, o rechazar. */
export function CompetitionInvitations({ slug, invitations }: { slug: string; invitations: Invitation[] }) {
  return (
    <Card aria-label="Convocatorias">
      <SectionTitle>Convocatorias a competencias</SectionTitle>
      <ul className="space-y-4">
        {invitations.map((i) => (
          <InvitationItem key={i.entryId} slug={slug} invitation={i} />
        ))}
      </ul>
    </Card>
  );
}

function InvitationItem({ slug, invitation: i }: { slug: string; invitation: Invitation }) {
  const [extras, setExtras] = useState<string[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const total =
    i.competition.entryFee +
    i.competition.extras.filter((x) => extras.includes(x.name)).reduce((s, x) => s + x.amount, 0);

  function respond(accept: boolean) {
    start(async () => {
      const r = await respondInvitationAction(slug, i.entryId, { accept, extras, authorized });
      setMessage(
        r.ok
          ? {
              tone: "info",
              text: accept
                ? `¡Listo! ${i.firstName} quedó inscrito(a).${total > 0 ? " Encuentras el cobro en Mis pagos." : ""}`
                : "Respuesta enviada a la escuela.",
            }
          : {
              tone: "danger",
              text:
                r.error === "not_authorized"
                  ? "Para aceptar debes marcar la autorización."
                  : r.error === "closed"
                    ? "Las inscripciones ya cerraron."
                    : "No se pudo enviar la respuesta.",
            },
      );
    });
  }

  return (
    <li className="space-y-2 rounded-2xl bg-canvas p-3 text-sm" aria-label={`Convocatoria de ${i.firstName}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Trophy className="size-4 text-ink-soft" />
        <span className="flex-1 font-semibold">
          {i.firstName} · {i.competition.name}
        </span>
        <Chip tone={ENTRY_STATUS_LABELS[i.status].tone}>{ENTRY_STATUS_LABELS[i.status].label}</Chip>
      </div>
      <p className="text-ink-soft">
        {i.competition.dates}
        {i.competition.place ? ` · ${i.competition.place}` : ""} · Pruebas: {i.events.join(", ")}
      </p>
      {i.competition.notes && <p>{i.competition.notes}</p>}
      {i.status === "ACCEPTED" && i.chosenExtras.length > 0 && <p>Servicios: {i.chosenExtras.join(", ")}</p>}
      {i.status === "INVITED" && i.competition.open && !message?.tone.startsWith("info") && (
        <div className="space-y-2">
          <p>
            Inscripción: <span className="font-semibold">{formatCOP(i.competition.entryFee)}</span> · responde
            antes del {i.competition.deadline}
          </p>
          {i.competition.extras.map((x) => (
            <label key={x.name} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={extras.includes(x.name)}
                onChange={(e) =>
                  setExtras((l) => (e.target.checked ? [...l, x.name] : l.filter((y) => y !== x.name)))
                }
              />
              {x.name} ({formatCOP(x.amount)})
            </label>
          ))}
          <p className="rounded-xl bg-surface p-2 text-xs text-ink-soft">{i.competition.authorizationText}</p>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
            Acepto y autorizo
          </label>
          <div className="flex flex-wrap gap-2">
            <Button className="h-9" disabled={pending} onClick={() => respond(true)}>
              Aceptar · {formatCOP(total)}
            </Button>
            <Button variant="secondary" className="h-9" disabled={pending} onClick={() => respond(false)}>
              No asistirá
            </Button>
          </div>
        </div>
      )}
      {i.status === "INVITED" && !i.competition.open && (
        <p className="text-ink-soft">Las inscripciones cerraron.</p>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </li>
  );
}
