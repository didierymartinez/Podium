"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { formatCOP } from "@/lib/money";

export type EnrollmentOptions = {
  groups: { id: string; name: string; capacity: number; enrolled: number; defaultFeePlanId: string | null }[];
  feePlans: { id: string; name: string; monthlyAmount: number }[];
  today: string;
};

type Errors = Record<string, string[] | undefined> | undefined;

/** Campos de matrícula (prefijo "enrollment."). */
export function EnrollmentFields({
  options,
  errors,
  showOverCapacity,
}: {
  options: EnrollmentOptions;
  errors: Errors;
  showOverCapacity: boolean;
}) {
  const error = (key: string) => errors?.[`enrollment.${key}`]?.[0];
  const firstGroup = options.groups[0];
  const [groupId, setGroupId] = useState(firstGroup?.id ?? "");
  const [feePlanId, setFeePlanId] = useState(firstGroup?.defaultFeePlanId ?? options.feePlans[0]?.id ?? "");
  const group = options.groups.find((g) => g.id === groupId);

  if (options.groups.length === 0 || options.feePlans.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Para matricular necesitas al menos un grupo y una tarifa activos. Puedes matricular después desde la
        ficha del alumno.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Grupo"
          hint={group ? `${group.enrolled} de ${group.capacity} cupos ocupados` : undefined}
          error={error("groupId")}
        >
          <Select
            name="enrollment.groupId"
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              const suggested = options.groups.find((g) => g.id === e.target.value)?.defaultFeePlanId;
              if (suggested) setFeePlanId(suggested);
            }}
          >
            {options.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.enrolled >= g.capacity ? `${g.name} (lleno)` : g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tarifa" error={error("feePlanId")}>
          <Select
            name="enrollment.feePlanId"
            value={feePlanId}
            onChange={(e) => setFeePlanId(e.target.value)}
          >
            {options.feePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatCOP(p.monthlyAmount)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha de inicio" error={error("startDate")}>
          <Input name="enrollment.startDate" type="date" defaultValue={options.today} required />
        </Field>
        <Field label="Estado" hint="Preinscrito = clase de prueba, aún no paga">
          <Select name="enrollment.status" defaultValue="ACTIVE">
            <option value="ACTIVE">Activo</option>
            <option value="PRE_ENROLLED">Preinscrito</option>
          </Select>
        </Field>
      </div>
      {showOverCapacity && (
        <label className="flex items-center gap-2 rounded-xl bg-sun/25 px-3.5 py-2.5 text-sm">
          <input type="checkbox" name="enrollment.allowOverCapacity" className="size-4 accent-brand" />
          El grupo está lleno. Matricular de todas formas (sobrecupo).
        </label>
      )}
    </div>
  );
}
