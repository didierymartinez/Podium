"use client";

import { Check, Plus, Trash } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import {
  Button,
  Card,
  Field,
  IconButton,
  Input,
  SectionTitle,
  Select,
  buttonClass,
  cn,
} from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { WEEKDAYS, describeSchedule, type ScheduleSlot } from "@/modules/groups/schedule";
import { BRAND_COLORS } from "@/modules/schools/brand-colors";
import type { ActionState } from "../action-context";
import { saveGroupAction } from "./actions";

export type GroupFormOptions = {
  disciplines: { id: string; name: string; levels: { id: string; name: string; position: number }[] }[];
  feePlans: { id: string; name: string; monthlyAmount: number }[];
};

export type GroupFormValues = {
  id?: string;
  name: string;
  disciplineId: string;
  levelId: string;
  capacity: number;
  defaultFeePlanId: string;
  color: string;
  schedule: ScheduleSlot[];
};

export function GroupForm({
  slug,
  options,
  initial,
}: {
  slug: string;
  options: GroupFormOptions;
  initial: GroupFormValues;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveGroupAction.bind(null, slug),
    {},
  );
  const [values, setValues] = useState(initial);
  const set = <K extends keyof GroupFormValues>(key: K, value: GroupFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const error = (key: string) => state.errors?.[key]?.[0];
  const levels = options.disciplines.find((d) => d.id === values.disciplineId)?.levels ?? [];

  function updateSlot(index: number, patch: Partial<ScheduleSlot>) {
    set(
      "schedule",
      values.schedule.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  }

  function addSlot() {
    const last = values.schedule.at(-1);
    const used = new Set(values.schedule.map((s) => s.weekday));
    const next = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d) && d > (last?.weekday ?? -1)) ?? 0;
    set("schedule", [
      ...values.schedule,
      { weekday: next, startTime: last?.startTime ?? "16:00", endTime: last?.endTime ?? "18:00" },
    ]);
  }

  return (
    <form onSubmit={submitWithoutReset(action)}>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="schedule" value={JSON.stringify(values.schedule)} />
      <input type="hidden" name="color" value={values.color} />
      <fieldset disabled={pending} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="space-y-6">
          <section className="space-y-4">
            <SectionTitle>Datos del grupo</SectionTitle>
            <Field label="Nombre" error={error("name")}>
              <Input
                name="name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Iniciación tarde"
                required
                maxLength={60}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Modalidad" error={error("disciplineId")}>
                <Select
                  name="disciplineId"
                  value={values.disciplineId}
                  onChange={(e) => setValues((v) => ({ ...v, disciplineId: e.target.value, levelId: "" }))}
                >
                  {options.disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      Patinaje · {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nivel" error={error("levelId")}>
                <Select
                  name="levelId"
                  value={values.levelId}
                  onChange={(e) => set("levelId", e.target.value)}
                >
                  <option value="">Varios niveles</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.position}. {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cupo máximo" error={error("capacity")}>
                <Input
                  name="capacity"
                  type="number"
                  min={1}
                  max={500}
                  value={values.capacity}
                  onChange={(e) => set("capacity", Number(e.target.value))}
                  required
                />
              </Field>
              <Field
                label="Tarifa sugerida"
                hint="Se propone al matricular"
                error={error("defaultFeePlanId")}
              >
                <Select
                  name="defaultFeePlanId"
                  value={values.defaultFeePlanId}
                  onChange={(e) => set("defaultFeePlanId", e.target.value)}
                >
                  <option value="">Sin tarifa sugerida</option>
                  {options.feePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatCOP(p.monthlyAmount)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>Horario semanal</SectionTitle>
            <ul className="space-y-2.5">
              {values.schedule.map((slot, index) => (
                <li
                  key={index}
                  className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center"
                >
                  <Select
                    aria-label="Día"
                    value={slot.weekday}
                    onChange={(e) => updateSlot(index, { weekday: Number(e.target.value) })}
                    className="col-span-1"
                  >
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </Select>
                  <IconButton
                    type="button"
                    className="sm:order-last"
                    onClick={() =>
                      set(
                        "schedule",
                        values.schedule.filter((_, i) => i !== index),
                      )
                    }
                    aria-label="Quitar día"
                    title="Quitar día"
                  >
                    <Trash className="size-4" />
                  </IconButton>
                  <Input
                    type="time"
                    aria-label="Desde"
                    value={slot.startTime}
                    onChange={(e) => updateSlot(index, { startTime: e.target.value })}
                  />
                  <Input
                    type="time"
                    aria-label="Hasta"
                    value={slot.endTime}
                    onChange={(e) => updateSlot(index, { endTime: e.target.value })}
                  />
                </li>
              ))}
            </ul>
            {error("schedule") && <p className="text-sm text-danger">{error("schedule")}</p>}
            <Button type="button" variant="secondary" className="h-10" onClick={addSlot}>
              <Plus className="size-4" /> Agregar día
            </Button>
          </section>

          <section className="space-y-3">
            <SectionTitle>Color en el calendario</SectionTitle>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Color del grupo">
              {BRAND_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={values.color === color}
                  aria-label={color}
                  onClick={() => set("color", color)}
                  className={cn(
                    "grid size-9 place-items-center rounded-full shadow-pill ring-offset-2 ring-offset-surface",
                    values.color === color && "ring-2 ring-ink",
                  )}
                  style={{ background: color }}
                >
                  {values.color === color && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit">
              {pending ? "Guardando…" : values.id ? "Guardar cambios" : "Crear grupo"}
            </Button>
            <Link href={`/${slug}/grupos`} className={buttonClass("ghost")}>
              Cancelar
            </Link>
            <FormStatus state={state} />
          </div>
        </Card>

        <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-sun/30 px-4 py-3 text-sm">
            <p className="font-semibold">Vista previa</p>
            <p className="text-ink-soft">Así aparecerá el grupo en el calendario.</p>
          </div>
          <Card className="p-5">
            <div className="rounded-2xl p-4 text-white shadow-pill" style={{ background: values.color }}>
              <p className="font-semibold">{values.name || "Nombre del grupo"}</p>
              <p className="text-sm opacity-90">
                {levels.find((l) => l.id === values.levelId)?.name ?? "Varios niveles"} · cupo{" "}
                {values.capacity || 0}
              </p>
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              {values.schedule.length > 0 ? describeSchedule(values.schedule) : "Sin horario"}
            </p>
          </Card>
        </div>
      </fieldset>
    </form>
  );
}
