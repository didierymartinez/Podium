"use client";

import { Field, Input, SectionTitle, Select } from "@/components/ui";
import { BLOOD_TYPES, DOCUMENT_TYPE_LABELS, PERSON_DOCUMENT_TYPES } from "@/modules/athletes/schemas";

export type AthleteValues = {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  birthDate: string;
  sex: string;
  phone: string;
  email: string;
  healthInsurer: string;
  bloodType: string;
  medicalNotes: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  schoolName: string;
  notes: string;
};

export const EMPTY_ATHLETE: AthleteValues = {
  firstName: "",
  lastName: "",
  documentType: "TI",
  documentNumber: "",
  birthDate: "",
  sex: "",
  phone: "",
  email: "",
  healthInsurer: "",
  bloodType: "",
  medicalNotes: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  schoolName: "",
  notes: "",
};

type Errors = Record<string, string[] | undefined> | undefined;

/** Campos del alumno (nombres con prefijo "athlete."). */
export function AthleteFields({
  initial,
  errors,
  onBirthDateChange,
}: {
  initial: AthleteValues;
  errors: Errors;
  onBirthDateChange?: (value: string) => void;
}) {
  const error = (key: string) => errors?.[`athlete.${key}`]?.[0];
  const n = (key: keyof AthleteValues) => `athlete.${key}`;

  return (
    <>
      <section className="space-y-4">
        <SectionTitle>Alumno</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombres" error={error("firstName")}>
            <Input
              name={n("firstName")}
              defaultValue={initial.firstName}
              required
              maxLength={60}
              autoComplete="off"
            />
          </Field>
          <Field label="Apellidos" error={error("lastName")}>
            <Input
              name={n("lastName")}
              defaultValue={initial.lastName}
              required
              maxLength={60}
              autoComplete="off"
            />
          </Field>
          <Field label="Fecha de nacimiento" error={error("birthDate")}>
            <Input
              name={n("birthDate")}
              type="date"
              defaultValue={initial.birthDate}
              required
              onChange={(e) => onBirthDateChange?.(e.target.value)}
            />
          </Field>
          <Field label="Sexo" error={error("sex")}>
            <Select name={n("sex")} defaultValue={initial.sex}>
              <option value="">Sin especificar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </Select>
          </Field>
          <Field label="Tipo de documento" error={error("documentType")}>
            <Select name={n("documentType")} defaultValue={initial.documentType}>
              {PERSON_DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Número de documento"
            hint="Opcional, pero evita duplicados"
            error={error("documentNumber")}
          >
            <Input name={n("documentNumber")} defaultValue={initial.documentNumber} maxLength={20} />
          </Field>
          <Field label="Celular del alumno" hint="Si tiene uno propio" error={error("phone")}>
            <Input name={n("phone")} type="tel" defaultValue={initial.phone} />
          </Field>
          <Field label="Colegio" error={error("schoolName")}>
            <Input name={n("schoolName")} defaultValue={initial.schoolName} maxLength={80} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Salud y emergencias</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="EPS" error={error("healthInsurer")}>
            <Input name={n("healthInsurer")} defaultValue={initial.healthInsurer} maxLength={60} />
          </Field>
          <Field label="Tipo de sangre (RH)" error={error("bloodType")}>
            <Select name={n("bloodType")} defaultValue={initial.bloodType}>
              <option value="">Sin dato</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contacto de emergencia" error={error("emergencyContactName")}>
            <Input
              name={n("emergencyContactName")}
              defaultValue={initial.emergencyContactName}
              maxLength={80}
            />
          </Field>
          <Field label="Celular de emergencia" error={error("emergencyContactPhone")}>
            <Input
              name={n("emergencyContactPhone")}
              type="tel"
              defaultValue={initial.emergencyContactPhone}
            />
          </Field>
        </div>
        <Field
          label="Alergias, condiciones médicas y medicamentos"
          hint="Información confidencial: se guarda cifrada y solo la ven administradores y coordinadores."
          error={error("medicalNotes")}
        >
          <textarea
            name={n("medicalNotes")}
            defaultValue={initial.medicalNotes}
            maxLength={1000}
            rows={3}
            className="block w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
          />
        </Field>
        <input type="hidden" name={n("email")} value={initial.email} />
        <input type="hidden" name={n("notes")} value={initial.notes} />
      </section>
    </>
  );
}
