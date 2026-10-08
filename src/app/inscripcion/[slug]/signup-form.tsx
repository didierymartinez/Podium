"use client";

import { CheckCircle2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { formatDayTitle } from "@/lib/dates";
import { describeSchedule } from "@/modules/groups/schedule";
import { useTurnstile } from "@/modules/auth/components/turnstile";
import type { PublicGroup } from "@/modules/signup/public-signup";
import { submitSignupAction, type SignupState } from "./actions";

export function SignupForm({
  slug,
  groups,
  turnstileSiteKey,
}: {
  slug: string;
  groups: PublicGroup[];
  turnstileSiteKey: string;
}) {
  const [v, setV] = useState({
    athleteFirstName: "",
    athleteLastName: "",
    birthDate: "",
    guardianFirstName: "",
    guardianLastName: "",
    phone: "",
    email: "",
    groupId: groups[0]?.id ?? "",
    trialDate: groups[0]?.dates[0] ?? "",
    dataConsent: false,
  });
  const [state, setState] = useState<SignupState>({});
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const getToken = useTurnstile(turnstileSiteKey, box);
  const group = groups.find((g) => g.id === v.groupId);
  const set = (k: keyof typeof v, value: string | boolean) => setV((s) => ({ ...s, [k]: value }));

  if (state.ok && state.done)
    return (
      <div className="space-y-2 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-mint" />
        <p className="text-lg font-semibold">¡Listo! Te esperamos</p>
        <p className="text-sm text-ink-soft">
          Clase de prueba en {state.done.groupName} el {formatDayTitle(state.done.trialDate)}. La escuela te
          escribirá para confirmar.
        </p>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          let token: string | null = null;
          try {
            token = await getToken();
          } catch {
            setState({ ok: false, message: "No pudimos verificar que eres una persona. Intenta de nuevo." });
            return;
          }
          setState(await submitSignupAction(slug, v, token));
        });
      }}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Alumno</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombres del alumno">
            <Input
              required
              maxLength={60}
              value={v.athleteFirstName}
              onChange={(e) => set("athleteFirstName", e.target.value)}
            />
          </Field>
          <Field label="Apellidos del alumno">
            <Input
              required
              maxLength={60}
              value={v.athleteLastName}
              onChange={(e) => set("athleteLastName", e.target.value)}
            />
          </Field>
          <Field label="Fecha de nacimiento">
            <Input
              type="date"
              required
              value={v.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
            />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Acudiente</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tus nombres">
            <Input
              required
              maxLength={60}
              value={v.guardianFirstName}
              onChange={(e) => set("guardianFirstName", e.target.value)}
            />
          </Field>
          <Field label="Tus apellidos">
            <Input
              required
              maxLength={60}
              value={v.guardianLastName}
              onChange={(e) => set("guardianLastName", e.target.value)}
            />
          </Field>
          <Field label="Celular (WhatsApp)">
            <Input required inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Correo (opcional)">
            <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Clase de prueba</legend>
        <Field
          label="Grupo"
          hint={
            group ? `${group.levelName ?? "Varios niveles"} · ${describeSchedule(group.schedule)}` : undefined
          }
        >
          <Select
            value={v.groupId}
            onChange={(e) => {
              const g = groups.find((x) => x.id === e.target.value);
              setV((s) => ({ ...s, groupId: e.target.value, trialDate: g?.dates[0] ?? "" }));
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Día de la clase de prueba">
          <Select value={v.trialDate} onChange={(e) => set("trialDate", e.target.value)}>
            {group?.dates.map((d) => (
              <option key={d} value={d}>
                {formatDayTitle(d)}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={v.dataConsent}
          onChange={(e) => set("dataConsent", e.target.checked)}
        />
        <span>
          Autorizo a la escuela a tratar estos datos para contactarme y agendar la clase de prueba (Ley 1581
          de 2012). Ver la{" "}
          <a href="/privacidad" className="font-semibold text-brand" target="_blank">
            política de privacidad
          </a>
          .
        </span>
      </label>
      <div ref={box} />
      {state.ok === false && state.message && <Alert>{state.message}</Alert>}
      <Button type="submit" className="w-full" disabled={pending}>
        Pedir clase de prueba
      </Button>
    </form>
  );
}
