"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Chip, SectionTitle, buttonClass } from "@/components/ui";
import { ADULT_AGE, ageOn } from "@/modules/athletes/enrollment-status";
import type { ActionState } from "../action-context";
import { createAthleteAction } from "./actions";
import { AthleteFields, EMPTY_ATHLETE } from "./athlete-fields";
import { EnrollmentFields, type EnrollmentOptions } from "./enrollment-fields";
import { GuardianFields } from "./guardian-fields";

export function NewAthleteForm({ slug, options }: { slug: string; options: EnrollmentOptions }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createAthleteAction.bind(null, slug),
    {},
  );
  const [birthDate, setBirthDate] = useState("");
  const [adultWithGuardian, setAdultWithGuardian] = useState(false);
  const [withEnrollment, setWithEnrollment] = useState(
    options.groups.length > 0 && options.feePlans.length > 0,
  );

  const age = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? ageOn(birthDate, options.today) : null;
  const isAdult = age !== null && age >= ADULT_AGE;
  const withGuardian = !isAdult || adultWithGuardian;

  return (
    <form onSubmit={submitWithoutReset(action)}>
      <input type="hidden" name="withGuardian" value={String(withGuardian)} />
      <input type="hidden" name="withEnrollment" value={String(withEnrollment)} />
      <fieldset disabled={pending} className="space-y-4">
        <Card className="space-y-6">
          <AthleteFields initial={EMPTY_ATHLETE} errors={state.errors} onBirthDateChange={setBirthDate} />
          {age !== null && age >= 0 && (
            <p className="-mt-2 text-sm text-ink-soft">
              {age} años · {isAdult ? "mayor de edad" : "menor de edad: necesita acudiente"}
            </p>
          )}
        </Card>

        <Card className="space-y-4">
          <SectionTitle action={<Chip tone="violet">Responsable de pago</Chip>}>Acudiente</SectionTitle>
          {isAdult && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={adultWithGuardian}
                onChange={(e) => setAdultWithGuardian(e.target.checked)}
              />
              El alumno es mayor de edad. Otra persona paga por él.
            </label>
          )}
          {withGuardian ? (
            <GuardianFields slug={slug} errors={state.errors} />
          ) : (
            <p className="text-sm text-ink-soft">El alumno será su propio responsable de pago.</p>
          )}
        </Card>

        <Card className="space-y-4">
          <SectionTitle
            action={
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-brand"
                  checked={withEnrollment}
                  onChange={(e) => setWithEnrollment(e.target.checked)}
                />
                Matricular ahora
              </label>
            }
          >
            Matrícula
          </SectionTitle>
          {withEnrollment ? (
            <EnrollmentFields
              options={options}
              errors={state.errors}
              showOverCapacity={state.code === "group_full"}
            />
          ) : (
            <p className="text-sm text-ink-soft">Podrás matricularlo después desde su ficha.</p>
          )}
        </Card>

        <div className="flex flex-wrap items-center gap-3 px-1">
          <Button type="submit">{pending ? "Guardando…" : "Guardar alumno"}</Button>
          <Link href={`/${slug}/alumnos`} className={buttonClass("ghost")}>
            Cancelar
          </Link>
          <FormStatus state={state} />
        </div>
      </fieldset>
    </form>
  );
}
