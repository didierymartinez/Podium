"use client";

import { Ban, CalendarClock, RotateCcw, UserRoundCog } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle, Select } from "@/components/ui";
import type { ActionState } from "../../action-context";
import { cancelSessionAction, rescheduleAction, restoreSessionAction, setSubstituteAction } from "../actions";

/** Cambios de una clase para la administración: cancelar, reprogramar y profesor sustituto (DEP-13 a DEP-15). */
export function CancelPanel({
  slug,
  sessionId,
  canceled,
  reason,
  rescheduled,
  session,
  coaches,
  substituteId,
}: {
  slug: string;
  sessionId: string;
  canceled: boolean;
  reason: string | null;
  rescheduled: boolean;
  session: { date: string; startTime: string; endTime: string };
  coaches: { id: string; name: string }[];
  substituteId: string | null;
}) {
  const [restoring, startTransition] = useTransition();

  if (canceled) {
    return (
      <Card>
        <SectionTitle>Clase cancelada</SectionTitle>
        <p className="mb-4 text-sm text-ink-soft">Motivo: {reason ?? "sin motivo"}.</p>
        {!rescheduled && (
          <Button
            variant="secondary"
            disabled={restoring}
            onClick={() => startTransition(() => void restoreSessionAction(slug, sessionId))}
          >
            <RotateCcw className="size-4" /> Restablecer clase
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <CancelCard slug={slug} sessionId={sessionId} />
      <RescheduleCard slug={slug} sessionId={sessionId} session={session} />
      <SubstituteCard slug={slug} sessionId={sessionId} coaches={coaches} substituteId={substituteId} />
    </div>
  );
}

function CancelCard({ slug, sessionId }: { slug: string; sessionId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    cancelSessionAction.bind(null, slug, sessionId),
    {},
  );
  return (
    <Card>
      <SectionTitle action={<Ban className="size-4 text-ink-faint" />}>Cancelar esta clase</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Por lluvia, un festivo sin clase o un torneo. Queda en el historial, no cuenta en el % y avisamos a
        las familias.
      </p>
      <form onSubmit={submitWithoutReset(action)} className="space-y-3">
        <Field label="Motivo" error={state.errors?.reason?.[0]}>
          <Input name="reason" required maxLength={120} placeholder="Lluvia" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Cancelando…" : "Cancelar clase"}
          </Button>
          <FormStatus state={state} />
        </div>
      </form>
    </Card>
  );
}

function RescheduleCard({
  slug,
  sessionId,
  session,
}: {
  slug: string;
  sessionId: string;
  session: { date: string; startTime: string; endTime: string };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    rescheduleAction.bind(null, slug, sessionId),
    {},
  );
  const error = (k: string) => state.errors?.[k]?.[0];
  return (
    <Card>
      <SectionTitle action={<CalendarClock className="size-4 text-ink-faint" />}>Reprogramar</SectionTitle>
      <form onSubmit={submitWithoutReset(action)} className="space-y-3">
        <Field label="Nueva fecha" error={error("date")}>
          <Input type="date" name="date" defaultValue={session.date} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde" error={error("startTime")}>
            <Input type="time" name="startTime" defaultValue={session.startTime} required />
          </Field>
          <Field label="Hasta" error={error("endTime")}>
            <Input type="time" name="endTime" defaultValue={session.endTime} required />
          </Field>
        </div>
        <Field label="Motivo" hint="Opcional">
          <Input name="reason" maxLength={120} placeholder="Pista ocupada" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Reprogramando…" : "Reprogramar clase"}
          </Button>
          <FormStatus state={state} />
        </div>
      </form>
    </Card>
  );
}

function SubstituteCard({
  slug,
  sessionId,
  coaches,
  substituteId,
}: {
  slug: string;
  sessionId: string;
  coaches: { id: string; name: string }[];
  substituteId: string | null;
}) {
  const [value, setValue] = useState(substituteId ?? "");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <SectionTitle action={<UserRoundCog className="size-4 text-ink-faint" />}>
        Profesor sustituto
      </SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Solo para esta clase. Podrá ver la lista y tomar asistencia.
      </p>
      <div className="space-y-3">
        <Field label="Sustituto">
          <Select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Sin sustituto</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={pending || value === (substituteId ?? "")}
            onClick={() =>
              startTransition(async () => setState(await setSubstituteAction(slug, sessionId, value || null)))
            }
          >
            Guardar sustituto
          </Button>
          <FormStatus state={state} />
        </div>
      </div>
    </Card>
  );
}
