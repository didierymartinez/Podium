"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { ESTIMATED_STUDENTS_OPTIONS } from "@/modules/schools/options";
import { slugify } from "@/modules/schools/slug";
import { SKATING_DISCIPLINES } from "@/modules/schools/sport-template";
import { checkSlugAction, createSchoolAction, type CreateSchoolState } from "./actions";

const CITIES = [
  "Bogotá",
  "Medellín",
  "Cali",
  "Barranquilla",
  "Cartagena",
  "Bucaramanga",
  "Pereira",
  "Manizales",
  "Armenia",
  "Ibagué",
  "Cúcuta",
  "Villavicencio",
  "Santa Marta",
  "Pasto",
  "Neiva",
  "Montería",
  "Popayán",
  "Tunja",
  "Valledupar",
  "Sincelejo",
  "Envigado",
  "Itagüí",
  "Bello",
  "Rionegro",
  "Sabaneta",
  "Chía",
  "Soacha",
  "Floridablanca",
  "Palmira",
  "Tuluá",
];

const STUDENT_LABELS: Record<(typeof ESTIMATED_STUDENTS_OPTIONS)[number], string> = {
  "1-30": "Hasta 30",
  "31-80": "31 a 80",
  "81-150": "81 a 150",
  "151-400": "151 a 400",
  "400+": "Más de 400",
};

export function CreateSchoolForm({ baseUrl }: { baseUrl: string }) {
  const [state, action, pending] = useActionState<CreateSchoolState, FormData>(createSchoolAction, {});
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(state.values?.slug));
  const [slugStatus, setSlugStatus] = useState<{ slug: string; available: boolean; message?: string } | null>(
    null,
  );

  const effectiveSlug = slugEdited ? slug : slugify(name);

  useEffect(() => {
    if (!effectiveSlug) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await checkSlugAction(effectiveSlug);
      if (!cancelled) setSlugStatus({ slug: effectiveSlug, ...result });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveSlug]);

  const shownSlugStatus = slugStatus?.slug === effectiveSlug ? slugStatus : null;
  const slugError =
    state.errors?.slug?.[0] ?? (shownSlugStatus?.available === false ? shownSlugStatus.message : undefined);

  return (
    <form action={action} className="space-y-5">
      <Field label="Nombre de la escuela" error={state.errors?.name?.[0]}>
        <Input
          name="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Club Patín Veloz"
        />
      </Field>

      <Field
        label="Dirección web"
        error={slugError}
        hint={shownSlugStatus?.available ? "✓ Disponible" : "Letras minúsculas, números y guiones"}
      >
        <div className="flex items-center rounded-xl border border-line bg-canvas focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <span className="pl-3 text-sm text-ink-soft">{baseUrl}/</span>
          <Input
            name="slug"
            required
            value={effectiveSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className="border-0 bg-transparent pl-0.5 shadow-none focus:ring-0"
            placeholder="patinveloz"
          />
        </div>
      </Field>

      <Field label="Ciudad" error={state.errors?.city?.[0]}>
        <Input
          name="city"
          required
          list="cities"
          defaultValue={state.values?.city}
          autoComplete="address-level2"
        />
        <datalist id="cities">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Modalidad principal" error={state.errors?.discipline?.[0]}>
          <Select name="discipline" required defaultValue={state.values?.discipline ?? "speed"}>
            {SKATING_DISCIPLINES.map((d) => (
              <option key={d.code} value={d.code}>
                Patinaje · {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="¿Cuántos alumnos tienen?" error={state.errors?.estimatedStudents?.[0]}>
          <Select name="estimatedStudents" required defaultValue={state.values?.estimatedStudents ?? ""}>
            <option value="" disabled>
              Elige un rango
            </option>
            {ESTIMATED_STUDENTS_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {STUDENT_LABELS[o]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creando tu escuela…" : "Crear escuela y empezar prueba gratis"}
      </Button>
    </form>
  );
}
