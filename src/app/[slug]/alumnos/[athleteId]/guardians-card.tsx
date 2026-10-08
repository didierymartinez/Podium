"use client";

import { MessageCircle, Plus, Star, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Avatar, Button, Card, Chip, IconButton, SectionTitle, Tile } from "@/components/ui";
import { whatsappLink } from "@/lib/whatsapp";
import type { ActionState } from "../../action-context";
import { addGuardianAction, removeGuardianAction, setPayerAction } from "../actions";
import { GuardianFields } from "../guardian-fields";

export type GuardianView = {
  id: string;
  name: string;
  phone: string;
  displayPhone: string;
  email: string | null;
  relationship: string;
  isPayer: boolean;
};

export function GuardiansCard({
  slug,
  athleteId,
  athleteFirstName,
  guardians,
}: {
  slug: string;
  athleteId: string;
  athleteFirstName: string;
  guardians: GuardianView[];
}) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, action, addPending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await addGuardianAction(slug, athleteId, prev, form);
    if (result.ok) setAdding(false);
    return result;
  }, {});

  return (
    <Card>
      <SectionTitle
        action={
          !adding && (
            <Button variant="secondary" className="h-9 px-4" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Agregar
            </Button>
          )
        }
      >
        Acudientes
      </SectionTitle>
      <ul className="space-y-2.5">
        {guardians.length === 0 && (
          <Tile className="text-sm text-ink-soft">
            Sin acudientes: el alumno es su propio responsable de pago.
          </Tile>
        )}
        {guardians.map((g) => (
          <li key={g.id}>
            <Tile className="flex flex-wrap items-center gap-3">
              <Avatar name={g.name} size={40} />
              <div className="min-w-[9rem] flex-1">
                <p className="truncate font-semibold">{g.name}</p>
                <p className="truncate text-sm text-ink-soft">
                  {g.relationship} · {g.displayPhone}
                </p>
              </div>
              {g.isPayer ? (
                <Chip tone="violet" dot>
                  Responsable de pago
                </Chip>
              ) : (
                <div className="flex gap-1.5">
                  <IconButton
                    disabled={pending}
                    title="Hacer responsable de pago"
                    aria-label={`Hacer a ${g.name} responsable de pago`}
                    onClick={() => startTransition(() => void setPayerAction(slug, athleteId, g.id))}
                  >
                    <Star className="size-4" />
                  </IconButton>
                  <IconButton
                    disabled={pending}
                    title="Quitar acudiente"
                    aria-label={`Quitar a ${g.name}`}
                    onClick={() => startTransition(() => void removeGuardianAction(slug, athleteId, g.id))}
                  >
                    <X className="size-4" />
                  </IconButton>
                </div>
              )}
              <a
                href={whatsappLink(
                  g.phone,
                  `Hola ${g.name.split(" ")[0]}, te escribimos sobre ${athleteFirstName}.`,
                )}
                target="_blank"
                rel="noreferrer"
                className="grid size-10 place-items-center rounded-full border border-line bg-surface text-mint shadow-pill"
                aria-label={`WhatsApp a ${g.name}`}
                title="Escribir por WhatsApp"
              >
                <MessageCircle className="size-4" />
              </a>
            </Tile>
          </li>
        ))}
        {adding && (
          <li>
            <Tile className="border-brand/30 bg-surface ring-4 ring-brand/8">
              <form onSubmit={submitWithoutReset(action)} className="space-y-4">
                <GuardianFields slug={slug} errors={state.errors} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isPayer" className="size-4 accent-brand" /> Será el responsable
                  de pago
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" className="h-10" disabled={addPending}>
                    Agregar acudiente
                  </Button>
                  <Button type="button" variant="ghost" className="h-10" onClick={() => setAdding(false)}>
                    Cancelar
                  </Button>
                  <FormStatus state={state} />
                </div>
              </form>
            </Tile>
          </li>
        )}
      </ul>
    </Card>
  );
}
