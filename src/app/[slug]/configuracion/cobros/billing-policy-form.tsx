"use client";

import { CalendarClock, Users } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { Button, Card, Chip, Field, Input, SectionTitle, Select, Tile, cn } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import type { Adjustment, BillingPolicy } from "@/modules/billing/policy";
import { amountDueOn, firstMonthAmount, monthlyChargeLines } from "@/modules/billing/pricing";
import { updateBillingPolicyAction } from "../actions";
import type { ActionState } from "../context";
import { submitWithoutReset } from "@/components/use-form-action";

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function BillingPolicyForm({
  slug,
  initial,
  samplePlans,
  canEdit,
}: {
  slug: string;
  initial: BillingPolicy;
  samplePlans: { name: string; monthlyAmount: number }[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateBillingPolicyAction.bind(null, slug),
    {},
  );
  const [policy, setPolicy] = useState(initial);
  const update = (patch: Partial<BillingPolicy>) => setPolicy((p) => ({ ...p, ...patch }));
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <SectionTitle>Política de cobro</SectionTitle>
        <form onSubmit={submitWithoutReset(action)}>
          <fieldset disabled={!canEdit || pending} className="space-y-6">
            <Group title="Calendario de la mensualidad">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Se genera el día" error={error("generationDay")}>
                  <DaySelect
                    name="generationDay"
                    value={policy.generationDay}
                    onChange={(generationDay) => update({ generationDay })}
                  />
                </Field>
                <Field label="Vence el día" error={error("dueDay")}>
                  <DaySelect name="dueDay" value={policy.dueDay} onChange={(dueDay) => update({ dueDay })} />
                </Field>
                <Field
                  label="En mora después de"
                  hint="Días tras el vencimiento"
                  error={error("overdueAfterDays")}
                >
                  <Input
                    name="overdueAfterDays"
                    type="number"
                    min={0}
                    max={90}
                    value={policy.overdueAfterDays}
                    onChange={(e) => update({ overdueAfterDays: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </Group>

            <Group title="Matrícula">
              <Field
                label="Valor de la matrícula"
                hint="Se cobra al matricular. Deja vacío si no cobras matrícula."
                error={error("enrollmentFee")}
              >
                <MoneyInput
                  name="enrollmentFee"
                  defaultValue={policy.enrollmentFee}
                  onValueChange={(enrollmentFee) => update({ enrollmentFee })}
                  placeholder="0"
                />
              </Field>
            </Group>

            <Group title="Descuentos y recargos">
              <AdjustmentField
                prefix="siblingDiscount"
                label="Descuento por hermanos"
                hint="Desde el 2.º hijo del mismo acudiente; paga completo el de mayor valor."
                value={policy.siblingDiscount}
                onChange={(siblingDiscount) => update({ siblingDiscount })}
                error={error("siblingDiscount")}
              />
              <AdjustmentField
                prefix="earlyPayment"
                label="Descuento por pronto pago"
                value={policy.earlyPayment}
                onChange={(earlyPayment) =>
                  update({ earlyPayment: { ...policy.earlyPayment, ...earlyPayment } })
                }
                error={error("earlyPayment")}
                extra={
                  policy.earlyPayment.type !== "none" && (
                    <Field label="Hasta el día">
                      <DaySelect
                        name="earlyPaymentUntilDay"
                        value={policy.earlyPayment.untilDay}
                        onChange={(untilDay) =>
                          update({ earlyPayment: { ...policy.earlyPayment, untilDay } })
                        }
                      />
                    </Field>
                  )
                }
              />
              {policy.earlyPayment.type === "none" && (
                <input type="hidden" name="earlyPaymentUntilDay" value={policy.earlyPayment.untilDay} />
              )}
              <AdjustmentField
                prefix="lateFee"
                label="Recargo por pago tardío"
                hint="Se suma si paga después del vencimiento."
                value={policy.lateFee}
                onChange={(lateFee) => update({ lateFee })}
                error={error("lateFee")}
              />
            </Group>

            <Group title="Alumnos que entran a mitad de mes">
              <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup">
                {(
                  [
                    ["full", "Mes completo", "Paga la mensualidad entera"],
                    ["prorated", "Proporcional", "Paga los días que quedan"],
                    ["next_month", "Desde el siguiente", "El primer mes no se cobra"],
                  ] as const
                ).map(([value, title, detail]) => (
                  <label
                    key={value}
                    className={cn(
                      "cursor-pointer rounded-2xl border p-3.5 transition",
                      policy.midMonthJoin === value
                        ? "border-brand bg-brand/6 ring-4 ring-brand/10"
                        : "border-line bg-canvas hover:border-ink-faint",
                    )}
                  >
                    <input
                      type="radio"
                      name="midMonthJoin"
                      value={value}
                      checked={policy.midMonthJoin === value}
                      onChange={() => update({ midMonthJoin: value })}
                      className="sr-only"
                    />
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-ink-soft">{detail}</span>
                  </label>
                ))}
              </div>
            </Group>

            <Group title="Numeración">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Prefijo de cuentas de cobro"
                  hint={`Ej.: ${policy.invoicePrefix || "CC"}-0001`}
                  error={error("invoicePrefix")}
                >
                  <Input
                    name="invoicePrefix"
                    value={policy.invoicePrefix}
                    onChange={(e) => update({ invoicePrefix: e.target.value.toUpperCase() })}
                    maxLength={4}
                  />
                </Field>
                <Field
                  label="Prefijo de recibos de caja"
                  hint={`Ej.: ${policy.receiptPrefix || "RC"}-0001`}
                  error={error("receiptPrefix")}
                >
                  <Input
                    name="receiptPrefix"
                    value={policy.receiptPrefix}
                    onChange={(e) => update({ receiptPrefix: e.target.value.toUpperCase() })}
                    maxLength={4}
                  />
                </Field>
              </div>
            </Group>

            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
              <Button type="submit">{pending ? "Guardando…" : "Guardar política"}</Button>
              <FormStatus state={state} />
            </div>
          </fieldset>
        </form>
      </Card>

      <BillingPreview policy={policy} samplePlans={samplePlans} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

function DaySelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (day: number) => void;
}) {
  return (
    <Select name={name} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {DAYS.map((d) => (
        <option key={d} value={d}>
          Día {d}
        </option>
      ))}
    </Select>
  );
}

function AdjustmentField({
  prefix,
  label,
  hint,
  value,
  onChange,
  error,
  extra,
}: {
  prefix: string;
  label: string;
  hint?: string;
  value: Adjustment;
  onChange: (value: Adjustment) => void;
  error?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr] sm:items-end">
        <Field label={label}>
          <Select
            name={`${prefix}Type`}
            value={value.type}
            onChange={(e) => onChange({ type: e.target.value as Adjustment["type"], value: 0 })}
          >
            <option value="none">No aplica</option>
            <option value="percent">Porcentaje</option>
            <option value="fixed">Valor fijo</option>
          </Select>
        </Field>
        {value.type === "percent" && (
          <Field label="Porcentaje">
            <div className="relative">
              <Input
                name={`${prefix}Value`}
                type="number"
                min={0}
                max={100}
                value={value.value}
                onChange={(e) => onChange({ ...value, value: Number(e.target.value) })}
                className="pr-8"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 grid place-items-center text-ink-soft">
                %
              </span>
            </div>
          </Field>
        )}
        {value.type === "fixed" && (
          <Field label="Valor">
            <MoneyInput
              key={`${prefix}-fixed`}
              name={`${prefix}Value`}
              defaultValue={value.value}
              onValueChange={(v) => onChange({ ...value, value: v })}
            />
          </Field>
        )}
        {extra}
      </div>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-ink-soft">{hint}</p>
      )}
    </div>
  );
}

/** Simulación con la configuración actual (se actualiza mientras se edita). */
function BillingPreview({
  policy,
  samplePlans,
}: {
  policy: BillingPolicy;
  samplePlans: { name: string; monthlyAmount: number }[];
}) {
  const isSample = samplePlans.length === 0;
  const plans = isSample
    ? [
        { name: "Competencia", monthlyAmount: 180000 },
        { name: "Iniciación", monthlyAmount: 120000 },
      ]
    : samplePlans.length === 1
      ? [samplePlans[0], samplePlans[0]]
      : samplePlans.slice(0, 2);

  const lines = monthlyChargeLines(
    [
      { label: `Sofía · ${plans[0].name}`, amount: plans[0].monthlyAmount },
      { label: `Tomás · ${plans[1].name}`, amount: plans[1].monthlyAmount },
    ],
    policy,
  );
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const early = amountDueOn(subtotal, 1, policy);
  const onTime = amountDueOn(subtotal, policy.dueDay, policy);
  const late = amountDueOn(subtotal, policy.dueDay + 1, policy);
  const hasEarly = policy.earlyPayment.type !== "none" && early.earlyPaymentDiscount > 0;
  const firstMonth = firstMonthAmount(plans[1].monthlyAmount, 16, 30, policy);

  return (
    <div className="space-y-3 xl:sticky xl:top-24 xl:self-start">
      <div className="rounded-2xl bg-sun/30 px-4 py-3 text-sm">
        <p className="font-semibold">Simulación</p>
        <p className="text-ink-soft">
          Así se cobraría a Laura, acudiente de dos hermanos{isSample ? " (valores de ejemplo)" : ""}.
        </p>
      </div>
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full bg-violet/12 text-violet">
            <Users className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{policy.invoicePrefix || "CC"}-0153 · Mensualidad</p>
            <p className="text-xs text-ink-soft">
              Se genera el día {policy.generationDay} · vence el día {policy.dueDay}
            </p>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          {lines.map((line) => (
            <li key={line.label}>
              <div className="flex justify-between gap-3">
                <span className="truncate">{line.label}</span>
                <span className="tabular-nums">{formatCOP(line.amount)}</span>
              </div>
              {line.siblingDiscount > 0 && (
                <div className="flex justify-between gap-3 text-mint">
                  <span>Descuento hermanos</span>
                  <span className="tabular-nums">−{formatCOP(line.siblingDiscount)}</span>
                </div>
              )}
            </li>
          ))}
          <li className="flex justify-between border-t border-line pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCOP(subtotal)}</span>
          </li>
        </ul>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <CalendarClock className="size-3.5" /> Según el día de pago
          </p>
          {hasEarly && (
            <PayRow
              label={`Hasta el día ${policy.earlyPayment.untilDay}`}
              amount={early.total}
              chip={<Chip tone="mint">Pronto pago</Chip>}
            />
          )}
          <PayRow
            label={
              hasEarly
                ? `Del día ${policy.earlyPayment.untilDay + 1} al ${policy.dueDay}`
                : `Hasta el día ${policy.dueDay}`
            }
            amount={onTime.total}
          />
          <PayRow
            label={`Desde el día ${policy.dueDay + 1}`}
            amount={late.total}
            chip={late.lateFee > 0 ? <Chip tone="danger">Recargo</Chip> : undefined}
          />
          <p className="text-xs text-ink-soft">
            Queda en mora{" "}
            {policy.overdueAfterDays === 0
              ? "desde el día siguiente al vencimiento"
              : `${policy.overdueAfterDays} días después del vencimiento`}
            .
          </p>
        </div>

        <Tile className="space-y-1 p-3 text-sm">
          {policy.enrollmentFee > 0 && (
            <p>
              Matrícula: <strong>{formatCOP(policy.enrollmentFee)}</strong> por alumno al matricular.
            </p>
          )}
          <p>
            Si Tomás entra el día 16, su primer mes es <strong>{formatCOP(firstMonth)}</strong>.
          </p>
        </Tile>
      </Card>
    </div>
  );
}

function PayRow({ label, amount, chip }: { label: string; amount: number; chip?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        {label} {chip}
      </span>
      <span className="font-semibold tabular-nums">{formatCOP(amount)}</span>
    </div>
  );
}
