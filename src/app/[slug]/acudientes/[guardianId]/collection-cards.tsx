"use client";

import { useActionState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { Button, Card, Chip, Field, Input, SectionTitle, Select, type ChipTone } from "@/components/ui";
import { submitWithoutReset } from "@/components/use-form-action";
import { formatCOP } from "@/lib/money";
import { NOTE_KIND_LABELS } from "@/modules/billing/collection-labels";
import type { ActionState } from "../../action-context";
import { addCollectionNoteAction, cancelPaymentPlanAction, createPaymentPlanAction } from "../actions";

const PROMISE: Record<string, { label: string; tone: ChipTone }> = {
  OPEN: { label: "Compromiso abierto", tone: "sun" },
  KEPT: { label: "Cumplido", tone: "mint" },
  BROKEN: { label: "Incumplido", tone: "danger" },
};

export type NoteView = {
  id: string;
  kind: keyof typeof NOTE_KIND_LABELS;
  note: string;
  date: string;
  promiseOn: string | null;
  promiseAmount: number | null;
  promiseStatus: string | null;
};

/** Bitácora de gestión de cobro (ADM-44). */
export function CollectionNotesCard({
  slug,
  guardianId,
  notes,
}: {
  slug: string;
  guardianId: string;
  notes: NoteView[];
}) {
  const [state, dispatch, pending] = useActionState(
    addCollectionNoteAction.bind(null, slug, guardianId),
    {} as ActionState,
  );
  const err = (k: string) => state.errors?.[k]?.[0];
  return (
    <Card>
      <SectionTitle>Gestión de cobro</SectionTitle>
      <form onSubmit={submitWithoutReset(dispatch)} className="grid gap-2 sm:grid-cols-[140px_1fr]">
        <Field label="Tipo">
          <Select name="kind" defaultValue="CALL">
            {Object.entries(NOTE_KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="¿Qué pasó?" error={err("note")}>
          <Input name="note" maxLength={500} placeholder="Dice que paga el viernes" />
        </Field>
        <Field label="Compromiso (fecha)" error={err("promiseOn")}>
          <Input name="promiseOn" type="date" />
        </Field>
        <Field label="Valor comprometido">
          <MoneyInput name="promiseAmount" />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="secondary" disabled={pending}>
            Registrar gestión
          </Button>
          <FormStatus state={state} />
        </div>
      </form>
      <ul className="mt-3 divide-y divide-line text-sm" aria-label="Bitácora de cobro">
        {notes.map((n) => (
          <li key={n.id} className="py-2">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{NOTE_KIND_LABELS[n.kind]}</span>
              <span className="text-xs text-ink-soft">{n.date}</span>
              {n.promiseStatus && (
                <Chip tone={PROMISE[n.promiseStatus].tone}>{PROMISE[n.promiseStatus].label}</Chip>
              )}
            </p>
            <p>{n.note}</p>
            {n.promiseOn && (
              <p className="text-xs text-ink-soft">
                Compromiso: {n.promiseAmount ? `${formatCOP(n.promiseAmount)} ` : ""}el {n.promiseOn}
              </p>
            )}
          </li>
        ))}
        {notes.length === 0 && <li className="py-2 text-ink-soft">Sin gestiones registradas.</li>}
      </ul>
    </Card>
  );
}

const INSTALLMENT: Record<string, { label: string; tone: ChipTone }> = {
  covered: { label: "Cumplida", tone: "mint" },
  overdue: { label: "Vencida", tone: "danger" },
  pending: { label: "Pendiente", tone: "neutral" },
};

/** Acuerdo de pago en cuotas (ADM-45). */
export function PaymentPlanCard({
  slug,
  guardianId,
  owed,
  today,
  plan,
}: {
  slug: string;
  guardianId: string;
  owed: number;
  today: string;
  plan: {
    id: string;
    total: number;
    paid: number;
    installments: { position: number; dueOn: string; amount: number; state: string }[];
  } | null;
}) {
  const [state, dispatch, pending] = useActionState(
    createPaymentPlanAction.bind(null, slug, guardianId),
    {} as ActionState,
  );
  const [canceling, start] = useTransition();
  const err = (k: string) => state.errors?.[k]?.[0];
  return (
    <Card>
      <SectionTitle>Acuerdo de pago</SectionTitle>
      {plan ? (
        <>
          <p className="mb-2 text-sm text-ink-soft">
            {formatCOP(plan.total)} en {plan.installments.length} cuotas · pagado{" "}
            {formatCOP(Math.min(plan.paid, plan.total))}
          </p>
          <ul className="space-y-1.5 text-sm" aria-label="Cuotas del acuerdo">
            {plan.installments.map((i) => (
              <li key={i.position} className="flex items-center gap-2">
                <span className="flex-1">
                  Cuota {i.position} · {i.dueOn}
                </span>
                <span className="tabular-nums">{formatCOP(i.amount)}</span>
                <Chip tone={INSTALLMENT[i.state].tone}>{INSTALLMENT[i.state].label}</Chip>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            className="mt-2 h-8 px-2"
            disabled={canceling}
            onClick={() => start(async () => void (await cancelPaymentPlanAction(slug, plan.id)))}
          >
            Cancelar acuerdo
          </Button>
        </>
      ) : (
        <form onSubmit={submitWithoutReset(dispatch)} className="grid gap-2 sm:grid-cols-3">
          <Field label="Valor del acuerdo" error={err("total")}>
            <MoneyInput name="total" defaultValue={owed || null} />
          </Field>
          <Field label="Cuotas" error={err("installments")}>
            <Input name="installments" type="number" min={2} max={24} defaultValue={3} />
          </Field>
          <Field label="Primera cuota" error={err("firstDueOn")}>
            <Input name="firstDueOn" type="date" min={today} defaultValue={today} />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Notas">
              <Input name="notes" maxLength={300} />
            </Field>
          </div>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Button type="submit" variant="secondary" disabled={pending}>
              Crear acuerdo
            </Button>
            <FormStatus state={state} />
          </div>
        </form>
      )}
    </Card>
  );
}
