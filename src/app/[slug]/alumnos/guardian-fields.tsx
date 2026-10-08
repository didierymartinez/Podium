"use client";

import { useEffect, useState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { DOCUMENT_TYPE_LABELS, RELATIONSHIPS, RELATIONSHIP_LABELS } from "@/modules/athletes/schemas";
import { lookupGuardianAction } from "./actions";

type Errors = Record<string, string[] | undefined> | undefined;
type Found = Awaited<ReturnType<typeof lookupGuardianAction>>;

/** Campos de un acudiente (prefijo "guardian."); si el celular ya existe, ofrece usar sus datos. */
export function GuardianFields({ slug, errors }: { slug: string; errors: Errors }) {
  const error = (key: string) => errors?.[`guardian.${key}`]?.[0];
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState<{ phone: string; guardian: Found } | null>(null);
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    documentType: "CC",
    documentNumber: "",
    email: "",
  });
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  useEffect(() => {
    if (phone.replace(/\D/g, "").length < 10) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const guardian = await lookupGuardianAction(slug, phone);
      if (!cancelled) setFound({ phone, guardian });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone, slug]);

  const match = found?.phone === phone ? found.guardian : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Celular (WhatsApp)" hint="Lo usaremos para avisos y cobros" error={error("phone")}>
          <Input
            name="guardian.phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </Field>
        <Field label="Parentesco">
          <Select name="guardian.relationship" defaultValue="MOTHER">
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {RELATIONSHIP_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {match && (
        <Alert tone="info">
          Este celular ya pertenece a{" "}
          <strong>
            {match.firstName} {match.lastName}
          </strong>
          . Se vinculará el mismo acudiente (por ejemplo, para hermanos).{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setValues({ ...match, documentType: match.documentType || "CC" })}
          >
            Usar sus datos
          </button>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombres" error={error("firstName")}>
          <Input
            name="guardian.firstName"
            value={values.firstName}
            onChange={set("firstName")}
            required
            maxLength={60}
          />
        </Field>
        <Field label="Apellidos" error={error("lastName")}>
          <Input
            name="guardian.lastName"
            value={values.lastName}
            onChange={set("lastName")}
            required
            maxLength={60}
          />
        </Field>
        <Field label="Tipo de documento" error={error("documentType")}>
          <Select name="guardian.documentType" value={values.documentType} onChange={set("documentType")}>
            {(["CC", "CE", "PPT", "PASSPORT"] as const).map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Número de documento" error={error("documentNumber")}>
          <Input
            name="guardian.documentNumber"
            value={values.documentNumber}
            onChange={set("documentNumber")}
            maxLength={20}
          />
        </Field>
        <Field label="Email" error={error("email")}>
          <Input
            name="guardian.email"
            type="email"
            value={values.email}
            onChange={set("email")}
            maxLength={120}
          />
        </Field>
      </div>
    </div>
  );
}
