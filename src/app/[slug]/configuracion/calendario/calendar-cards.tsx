"use client";

import { CalendarOff, Plus, Trash } from "lucide-react";
import { useActionState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Chip, Field, IconButton, Input, SectionTitle, Tile, cn } from "@/components/ui";
import { formatDateSpan, formatDayTitle, type IsoDate } from "@/lib/dates";
import { createClosureAction, deleteClosureAction } from "../actions";
import type { ActionState } from "../context";

type ClosureView = { id: string; startDate: IsoDate; endDate: IsoDate; reason: string };

export function ClosuresCard({
  slug,
  canEdit,
  closures,
  today,
}: {
  slug: string;
  canEdit: boolean;
  closures: ClosureView[];
  today: IsoDate;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createClosureAction.bind(null, slug),
    {},
  );
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <Card>
      <SectionTitle>Días sin clase</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Vacaciones, cierres de la pista o eventos. En estas fechas no se programan clases ni se toma
        asistencia. Los fines de semana y festivos tienen clase si el grupo tiene horario ese día.
      </p>

      {canEdit && (
        <form onSubmit={submitWithoutReset(action)} className="mb-5 space-y-3">
          <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-[160px_160px_minmax(0,1fr)]">
            <Field label="Desde" error={error("startDate")}>
              <Input type="date" name="startDate" required min={today} />
            </Field>
            <Field label="Hasta" hint="Opcional" error={error("endDate")}>
              <Input type="date" name="endDate" min={today} />
            </Field>
            <Field label="Motivo" error={error("reason")}>
              <Input name="reason" required maxLength={80} placeholder="Vacaciones de fin de año" />
            </Field>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="secondary" className="h-10" disabled={pending}>
              <Plus className="size-4" /> {pending ? "Guardando…" : "Agregar días sin clase"}
            </Button>
            <FormStatus state={state} />
          </div>
        </form>
      )}

      <ul className="space-y-2.5" aria-label="Días sin clase">
        {closures.map((c) => (
          <ClosureRow key={c.id} slug={slug} closure={c} canEdit={canEdit} past={c.endDate < today} />
        ))}
        {closures.length === 0 && (
          <Tile className="text-center text-sm text-ink-soft">No hay días sin clase programados.</Tile>
        )}
      </ul>
    </Card>
  );
}

function ClosureRow({
  slug,
  closure,
  canEdit,
  past,
}: {
  slug: string;
  closure: ClosureView;
  canEdit: boolean;
  past: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <li>
      <Tile className={cn("flex items-center gap-3", past && "opacity-60")}>
        <span className="hatch grid size-9 shrink-0 place-items-center rounded-full bg-muted text-ink-soft">
          <CalendarOff className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{closure.reason}</p>
          <p className="text-sm text-ink-soft">{formatDateSpan(closure.startDate, closure.endDate)}</p>
        </div>
        {canEdit && !past && (
          <IconButton
            disabled={pending}
            title="Quitar"
            aria-label={`Quitar ${closure.reason}`}
            onClick={() => startTransition(() => void deleteClosureAction(slug, closure.id))}
          >
            <Trash className="size-4" />
          </IconButton>
        )}
      </Tile>
    </li>
  );
}

export function HolidaysCard({
  slug,
  canEdit,
  holidays,
}: {
  slug: string;
  canEdit: boolean;
  holidays: { date: IsoDate; name: string; closed: boolean }[];
}) {
  return (
    <Card>
      <SectionTitle action={<Chip tone="sun">Referencia</Chip>}>Festivos de Colombia</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Se muestran en el tablero como referencia, pero las clases se mantienen. Si no vas a dar clase,
        márcalo como día sin clase.
      </p>
      <ul className="space-y-2" aria-label="Festivos">
        {holidays.map((h) => (
          <HolidayRow key={h.date} slug={slug} holiday={h} canEdit={canEdit} />
        ))}
      </ul>
    </Card>
  );
}

function HolidayRow({
  slug,
  holiday,
  canEdit,
}: {
  slug: string;
  holiday: { date: IsoDate; name: string; closed: boolean };
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  function markClosed() {
    const form = new FormData();
    form.set("startDate", holiday.date);
    form.set("reason", holiday.name);
    startTransition(() => void createClosureAction(slug, {}, form));
  }
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-canvas px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{holiday.name}</p>
        <p className="text-xs capitalize text-ink-soft">{formatDayTitle(holiday.date)}</p>
      </div>
      {holiday.closed ? (
        <Chip>Sin clase</Chip>
      ) : (
        canEdit && (
          <Button
            variant="ghost"
            className="h-8 px-3 text-xs"
            disabled={pending}
            onClick={markClosed}
            aria-label={`Marcar sin clase ${holiday.name}`}
          >
            Marcar sin clase
          </Button>
        )
      )}
    </li>
  );
}
