"use client";

import { Check, MapPin, MessageCircle, Phone } from "lucide-react";
import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { Button, Card, Field, Input, SectionTitle, Select, cn, initials } from "@/components/ui";
import { BRAND_COLORS } from "@/modules/schools/brand-colors";
import { updateProfileAction } from "./actions";
import type { ActionState } from "./context";
import { submitWithoutReset } from "@/components/use-form-action";

export type ProfileValues = {
  name: string;
  legalName: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  contactEmail: string;
  city: string;
  address: string;
  brandColor: string;
};

export function ProfileForm({
  slug,
  initial,
  canEdit,
}: {
  slug: string;
  initial: ProfileValues;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateProfileAction.bind(null, slug),
    {},
  );
  const [values, setValues] = useState(initial);
  const [appliedState, setAppliedState] = useState(state);
  if (appliedState !== state) {
    // Refleja la forma normalizada que guardó el servidor (NIT con dígito, celular).
    setAppliedState(state);
    if (state.ok && state.values) setValues((v) => ({ ...v, ...state.values }));
  }
  const set = (key: keyof ProfileValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <form onSubmit={submitWithoutReset(action)}>
          <fieldset disabled={!canEdit || pending} className="space-y-6">
            <section className="space-y-4">
              <SectionTitle>Identidad</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre comercial" error={error("name")}>
                  <Input name="name" value={values.name} onChange={set("name")} required maxLength={80} />
                </Field>
                <Field label="Razón social" hint="Opcional · aparece en recibos" error={error("legalName")}>
                  <Input
                    name="legalName"
                    value={values.legalName}
                    onChange={set("legalName")}
                    maxLength={120}
                  />
                </Field>
                <Field label="Tipo de documento" error={error("documentType")}>
                  <Select name="documentType" value={values.documentType} onChange={set("documentType")}>
                    <option value="">Sin documento</option>
                    <option value="NIT">NIT</option>
                    <option value="CC">Cédula de ciudadanía</option>
                    <option value="CE">Cédula de extranjería</option>
                  </Select>
                </Field>
                <Field
                  label="Número"
                  hint={values.documentType === "NIT" ? "Con o sin dígito de verificación" : undefined}
                  error={error("documentNumber")}
                >
                  <Input
                    name="documentNumber"
                    value={values.documentNumber}
                    onChange={set("documentNumber")}
                    placeholder={values.documentType === "NIT" ? "901.234.567-8" : ""}
                    maxLength={20}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-4">
              <SectionTitle>Contacto</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Celular / WhatsApp"
                  hint="Las familias te escribirán aquí"
                  error={error("phone")}
                >
                  <Input
                    name="phone"
                    type="tel"
                    value={values.phone}
                    onChange={set("phone")}
                    placeholder="300 123 4567"
                  />
                </Field>
                <Field label="Email de contacto" error={error("contactEmail")}>
                  <Input
                    name="contactEmail"
                    type="email"
                    value={values.contactEmail}
                    onChange={set("contactEmail")}
                  />
                </Field>
                <Field label="Ciudad" error={error("city")}>
                  <Input name="city" value={values.city} onChange={set("city")} required maxLength={80} />
                </Field>
                <Field label="Dirección de la pista" error={error("address")}>
                  <Input name="address" value={values.address} onChange={set("address")} maxLength={160} />
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <SectionTitle>Color de la escuela</SectionTitle>
              <input type="hidden" name="brandColor" value={values.brandColor} />
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Color de la escuela">
                {BRAND_COLORS.map((color) => {
                  const selected = values.brandColor.toLowerCase() === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={color}
                      onClick={() => setValues((v) => ({ ...v, brandColor: color }))}
                      className={cn(
                        "grid size-10 place-items-center rounded-full shadow-pill ring-offset-2 ring-offset-surface transition",
                        selected && "ring-2 ring-ink",
                      )}
                      style={{ background: color }}
                    >
                      {selected && <Check className="size-4 text-white" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-ink-soft">
                El logo se podrá subir cuando habilitemos el almacenamiento de archivos.
              </p>
            </section>

            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
              <Button type="submit">{pending ? "Guardando…" : "Guardar perfil"}</Button>
              <FormStatus state={state} />
            </div>
          </fieldset>
        </form>
      </Card>

      <ProfilePreview values={values} />
    </div>
  );
}

/** Vista previa: así verán las familias la escuela en su app. */
function ProfilePreview({ values }: { values: ProfileValues }) {
  return (
    <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-2xl bg-sun/30 px-4 py-3 text-sm">
        <p className="font-semibold">Vista previa</p>
        <p className="text-ink-soft">Así verán tu escuela los acudientes en la app.</p>
      </div>
      <div className="overflow-hidden rounded-[28px] border border-white/70 bg-surface shadow-soft dark:border-line">
        <div className="h-24" style={{ background: values.brandColor }} />
        <div className="-mt-9 px-5 pb-5">
          <span
            className="grid size-[72px] place-items-center rounded-2xl text-2xl font-bold text-white ring-4 ring-surface"
            style={{ background: values.brandColor }}
          >
            {initials(values.name || "?")}
          </span>
          <p className="mt-3 text-lg font-semibold">{values.name || "Nombre de la escuela"}</p>
          {values.legalName && <p className="text-sm text-ink-soft">{values.legalName}</p>}
          <ul className="mt-4 space-y-2 text-sm text-ink-soft">
            <li className="flex items-center gap-2">
              <MapPin className="size-4" />{" "}
              {[values.address, values.city].filter(Boolean).join(" · ") || "Ciudad"}
            </li>
            {values.phone && (
              <li className="flex items-center gap-2">
                <Phone className="size-4" /> {values.phone}
              </li>
            )}
          </ul>
          <span
            className="mt-5 flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold text-white"
            style={{ background: values.brandColor }}
          >
            <MessageCircle className="size-4" /> Escribir por WhatsApp
          </span>
        </div>
      </div>
    </div>
  );
}
