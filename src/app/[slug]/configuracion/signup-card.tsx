"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, Input, SectionTitle } from "@/components/ui";
import { updateSignupAction } from "./signup-actions";

/** Formulario público de pre-inscripción con clase de prueba (ADM-19). */
export function SignupCard({
  slug,
  canEdit,
  enabled: initialEnabled,
  intro: initialIntro,
  link,
}: {
  slug: string;
  canEdit: boolean;
  enabled: boolean;
  intro: string;
  link: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [intro, setIntro] = useState(initialIntro);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Card className="space-y-3">
      <SectionTitle>Pre-inscripción en línea</SectionTitle>
      <p className="text-sm text-ink-soft">
        Comparte un link para que las familias pidan una clase de prueba. Quedan como pre-inscritas en el
        grupo y aparecen en la asistencia marcadas como &quot;prueba&quot;.
      </p>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={enabled}
          onChange={(e) => {
            setSaved(false);
            setEnabled(e.target.checked);
          }}
        />
        Recibir pre-inscripciones por el link público
      </label>
      <Field label="Mensaje de bienvenida (opcional)">
        <Input disabled={!canEdit} maxLength={500} value={intro} onChange={(e) => setIntro(e.target.value)} />
      </Field>
      {initialEnabled && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-canvas p-3 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono" aria-label="Link de pre-inscripción">
            {link}
          </span>
          <Button
            type="button"
            variant="ghost"
            className="h-8"
            onClick={() => void navigator.clipboard?.writeText(link)}
          >
            <Copy className="size-4" /> Copiar
          </Button>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-brand"
          >
            <ExternalLink className="size-4" /> Abrir
          </a>
        </div>
      )}
      {saved && <Alert tone="info">Pre-inscripción actualizada.</Alert>}
      {canEdit && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await updateSignupAction(slug, { enabled, intro });
              setSaved(r.ok);
            })
          }
        >
          Guardar pre-inscripción
        </Button>
      )}
    </Card>
  );
}
