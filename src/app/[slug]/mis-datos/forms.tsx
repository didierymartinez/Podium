"use client";

import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Field, Input, cn } from "@/components/ui";
import type { NotificationPreferences } from "@/modules/notifications/preferences";
import type { ActionState } from "../action-context";
import {
  confirmFamilyDataAction,
  requestDeletionAction,
  savePreferencesAction,
  setImageConsentForKidAction,
  setWhatsAppConsentAction,
  updateProfileAction,
} from "./actions";

export function ProfileForm({
  slug,
  initial,
  email,
}: {
  slug: string;
  initial: { name: string; phone: string };
  email: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateProfileAction.bind(null, slug),
    {},
  );
  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-3">
      <Field label="Nombre" error={state.errors?.name?.[0]}>
        <Input name="name" defaultValue={initial.name} required maxLength={80} />
      </Field>
      <Field label="Celular" error={state.errors?.phone?.[0]}>
        <Input name="phone" type="tel" defaultValue={initial.phone} maxLength={30} />
      </Field>
      <p className="text-sm text-ink-soft">Email: {email}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          Guardar
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

const TOPICS = {
  billing: "Cobros y pagos",
  attendance: "Clases y asistencia",
  notices: "Avisos de la escuela",
} as const;

export function PreferencesForm({ slug, initial }: { slug: string; initial: NotificationPreferences }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    savePreferencesAction.bind(null, slug),
    {},
  );
  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-3">
      <table className="w-full text-sm" aria-label="Preferencias de notificaciones">
        <thead className="text-left text-ink-soft">
          <tr>
            <th className="py-1 font-semibold">Tema</th>
            <th className="py-1 text-center font-semibold">Push</th>
            <th className="py-1 text-center font-semibold">Correo</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(TOPICS) as (keyof typeof TOPICS)[]).map((t) => (
            <tr key={t}>
              <td className="py-1.5">{TOPICS[t]}</td>
              {(["push", "email"] as const).map((c) => (
                <td key={c} className="py-1.5 text-center">
                  <input
                    type="checkbox"
                    name={`${t}.${c}`}
                    defaultChecked={initial[t][c]}
                    aria-label={`${TOPICS[t]} por ${c === "push" ? "push" : "correo"}`}
                    className="size-4 accent-brand"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          Guardar preferencias
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function ConsentToggles({
  slug,
  whatsapp,
  kids,
}: {
  slug: string;
  whatsapp: boolean;
  kids: { id: string; name: string; imageConsent: "GRANTED" | "DENIED" | null }[];
}) {
  const [wa, setWa] = useState(whatsapp);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-brand"
          checked={wa}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setWa(next);
            startTransition(() => void setWhatsAppConsentAction(slug, next));
          }}
        />
        <span>Autorizo a la escuela a escribirme por WhatsApp (avisos y cobros).</span>
      </label>
      {kids.map((k) => (
        <div key={k.id} className="text-sm">
          <p className="font-semibold">Uso de imagen de {k.name}</p>
          <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label={`Uso de imagen de ${k.name}`}>
            {(
              [
                ["GRANTED", "Autorizo"],
                ["DENIED", "No autorizo"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={k.imageConsent === value}
                disabled={pending}
                onClick={() => startTransition(() => void setImageConsentForKidAction(slug, k.id, value))}
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-semibold",
                  k.imageConsent === value
                    ? "bg-brand/12 text-brand-strong"
                    : "border border-line bg-surface text-ink-soft",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DeletionRequest({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    requestDeletionAction.bind(null, slug),
    {},
  );
  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-2">
      <Field label="Pedir que eliminen mis datos" hint="La escuela debe responder en máximo 15 días hábiles">
        <Input name="reason" maxLength={500} placeholder="Motivo (opcional)" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="ghost" disabled={pending}>
          Enviar solicitud
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

/** Re-matrícula (ADM-18): la familia confirma que sus datos están al día. */
export function ConfirmDataButton({ slug }: { slug: string }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={pending}
        onClick={() => start(async () => setState(await confirmFamilyDataAction(slug)))}
      >
        Mis datos están al día
      </Button>
      <FormStatus state={state} />
    </div>
  );
}
