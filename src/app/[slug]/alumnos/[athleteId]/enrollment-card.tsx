"use client";

import { LogIn, Plus, Snowflake, UserMinus } from "lucide-react";
import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Chip, Field, Input, SectionTitle, Select, Tile, type ChipTone } from "@/components/ui";
import { formatLongDate } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import {
  ENROLLMENT_STATUS_LABELS,
  WITHDRAWAL_REASON_LABELS,
  canTransition,
  type EnrollmentStatus,
} from "@/modules/athletes/enrollment-status";
import type { ActionState } from "../../action-context";
import { changeStatusAction, enrollAction } from "../actions";
import { EnrollmentFields, type EnrollmentOptions } from "../enrollment-fields";

export type EnrollmentView = {
  id: string;
  status: EnrollmentStatus;
  groupName: string;
  groupColor: string;
  feePlanName: string;
  monthlyAmount: number;
  startDate: string;
  endDate: string | null;
  frozenUntil: string | null;
  withdrawalReason: keyof typeof WITHDRAWAL_REASON_LABELS | null;
};

const STATUS_TONE: Record<EnrollmentStatus, ChipTone> = {
  PRE_ENROLLED: "sun",
  ACTIVE: "mint",
  FROZEN: "violet",
  WITHDRAWN: "neutral",
  DISCARDED: "neutral",
};

export function EnrollmentCard({
  slug,
  athleteId,
  enrollments,
  options,
}: {
  slug: string;
  athleteId: string;
  enrollments: EnrollmentView[];
  options: EnrollmentOptions;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <SectionTitle
        action={
          !adding && (
            <Button variant="secondary" className="h-9 px-4" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Matricular
            </Button>
          )
        }
      >
        Matrículas
      </SectionTitle>
      <div className="space-y-3">
        {adding && (
          <NewEnrollment
            slug={slug}
            athleteId={athleteId}
            options={options}
            onDone={() => setAdding(false)}
          />
        )}
        {enrollments.length === 0 && !adding && (
          <Tile className="text-center text-sm text-ink-soft">Sin matrículas todavía.</Tile>
        )}
        {enrollments.map((e) => (
          <EnrollmentRow key={e.id} slug={slug} enrollment={e} />
        ))}
      </div>
    </Card>
  );
}

function EnrollmentRow({ slug, enrollment: e }: { slug: string; enrollment: EnrollmentView }) {
  const [mode, setMode] = useState<"FROZEN" | "WITHDRAWN" | null>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await changeStatusAction(slug, e.id, prev, form);
    if (result.ok) setMode(null);
    return result;
  }, {});

  return (
    <Tile className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="mt-1.5 size-3 shrink-0 rounded-full"
          style={{ background: e.groupColor }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{e.groupName}</p>
          <p className="text-sm text-ink-soft">
            {e.feePlanName} · {formatCOP(e.monthlyAmount)}/mes · desde el {formatLongDate(e.startDate)}
          </p>
          {e.status === "FROZEN" && e.frozenUntil && (
            <p className="text-sm text-violet">Congelada hasta el {formatLongDate(e.frozenUntil)}</p>
          )}
          {e.status === "WITHDRAWN" && (
            <p className="text-sm text-ink-soft">
              Retirado{e.endDate ? ` el ${formatLongDate(e.endDate)}` : ""}
              {e.withdrawalReason ? ` · ${WITHDRAWAL_REASON_LABELS[e.withdrawalReason]}` : ""}
            </p>
          )}
        </div>
        <Chip tone={STATUS_TONE[e.status]} dot>
          {ENROLLMENT_STATUS_LABELS[e.status]}
        </Chip>
      </div>

      {mode === null && (
        <form onSubmit={submitWithoutReset(action)} className="flex flex-wrap gap-2">
          {canTransition(e.status, "ACTIVE") && (
            <Button
              type="submit"
              name="to"
              value="ACTIVE"
              variant="secondary"
              className="h-9 px-3.5"
              disabled={pending}
            >
              <LogIn className="size-4" /> {e.status === "PRE_ENROLLED" ? "Activar" : "Reactivar"}
            </Button>
          )}
          {canTransition(e.status, "FROZEN") && (
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3.5"
              onClick={() => setMode("FROZEN")}
            >
              <Snowflake className="size-4" /> Congelar
            </Button>
          )}
          {canTransition(e.status, "WITHDRAWN") && (
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3.5"
              onClick={() => setMode("WITHDRAWN")}
            >
              <UserMinus className="size-4" /> Retirar
            </Button>
          )}
          {canTransition(e.status, "DISCARDED") && (
            <Button
              type="submit"
              name="to"
              value="DISCARDED"
              variant="ghost"
              className="h-9 px-3.5"
              disabled={pending}
            >
              Descartar
            </Button>
          )}
          <FormStatus state={state} />
        </form>
      )}

      {mode && (
        <form
          onSubmit={submitWithoutReset(action)}
          className="space-y-3 rounded-xl border border-line bg-surface p-3"
        >
          <input type="hidden" name="to" value={mode} />
          {mode === "FROZEN" ? (
            <Field
              label="Congelar hasta"
              hint="Opcional. Mientras esté congelada no se cobra mensualidad."
              error={state.errors?.frozenUntil?.[0]}
            >
              <Input name="frozenUntil" type="date" />
            </Field>
          ) : (
            <Field label="Motivo del retiro" error={state.errors?.reason?.[0]}>
              <Select name="reason" defaultValue="">
                <option value="" disabled>
                  Elige un motivo
                </option>
                {Object.entries(WITHDRAWAL_REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Observación">
            <Input name="notes" maxLength={300} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="h-9 px-4" disabled={pending}>
              {mode === "FROZEN" ? "Congelar matrícula" : "Confirmar retiro"}
            </Button>
            <Button type="button" variant="ghost" className="h-9" onClick={() => setMode(null)}>
              Cancelar
            </Button>
            <FormStatus state={state} />
          </div>
        </form>
      )}
    </Tile>
  );
}

function NewEnrollment({
  slug,
  athleteId,
  options,
  onDone,
}: {
  slug: string;
  athleteId: string;
  options: EnrollmentOptions;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await enrollAction(slug, athleteId, prev, form);
    if (result.ok) onDone();
    return result;
  }, {});
  return (
    <Tile className="border-brand/30 bg-surface ring-4 ring-brand/8">
      <form onSubmit={submitWithoutReset(action)} className="space-y-4">
        <EnrollmentFields
          options={options}
          errors={state.errors}
          showOverCapacity={state.code === "group_full"}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="h-10" disabled={pending}>
            Matricular
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={onDone}>
            Cancelar
          </Button>
          <FormStatus state={state} />
        </div>
      </form>
    </Tile>
  );
}
