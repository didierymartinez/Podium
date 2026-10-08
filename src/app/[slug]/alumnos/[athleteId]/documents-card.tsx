"use client";

import { ExternalLink, Trash } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { AttachedFileField } from "@/components/attached-file-field";
import { DocumentStatusChip } from "@/components/document-status-chip";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, IconButton, Input, SectionTitle, Tile, cn } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import type { DocumentStatus } from "@/modules/documents/status";
import type { ActionState } from "../../action-context";
import { recordDocumentAction, removeDocumentAction, setImageConsentAction } from "../../documentos/actions";

export type DocumentRow = {
  typeId: string;
  name: string;
  required: boolean;
  validityMonths: number | null;
  status: DocumentStatus;
  document: {
    id: string;
    issuedOn: string;
    expiresOn: string | null;
    notes: string | null;
    fileUrl: string | null;
  } | null;
};

export function DocumentsCard({
  slug,
  athleteId,
  rows,
  today,
  imageConsent,
}: {
  slug: string;
  athleteId: string;
  rows: DocumentRow[];
  today: string;
  imageConsent: "GRANTED" | "DENIED" | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card>
      <SectionTitle>Documentos</SectionTitle>
      <ul className="space-y-2.5" aria-label="Documentos del alumno">
        {rows.map((row) => (
          <li key={row.typeId}>
            <Tile className="space-y-3 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {row.name}
                    {!row.required && (
                      <span className="ml-1 text-xs font-normal text-ink-soft">(opcional)</span>
                    )}
                  </p>
                  {row.document && (
                    <p className="text-xs text-ink-soft">
                      Expedido {formatShortDate(row.document.issuedOn)}
                      {row.document.expiresOn
                        ? ` · vence ${formatShortDate(row.document.expiresOn)}`
                        : " · no vence"}
                      {row.document.notes ? ` · ${row.document.notes}` : ""}
                    </p>
                  )}
                </div>
                <DocumentStatusChip status={row.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.document?.fileUrl && (
                  <a
                    href={row.document.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold"
                  >
                    <ExternalLink className="size-4" /> Ver soporte
                  </a>
                )}
                {editing !== row.typeId && (
                  <Button
                    variant="secondary"
                    className="h-9 px-3"
                    onClick={() => setEditing(row.typeId)}
                    aria-label={`${row.document ? "Renovar" : "Registrar"} ${row.name}`}
                  >
                    {row.document ? "Renovar" : "Registrar"}
                  </Button>
                )}
                {row.document && (
                  <RemoveDocument
                    slug={slug}
                    athleteId={athleteId}
                    documentId={row.document.id}
                    name={row.name}
                  />
                )}
              </div>
              {editing === row.typeId && (
                <RecordForm
                  slug={slug}
                  athleteId={athleteId}
                  row={row}
                  today={today}
                  onDone={() => setEditing(null)}
                />
              )}
            </Tile>
          </li>
        ))}
      </ul>
      <ImageConsent slug={slug} athleteId={athleteId} value={imageConsent} />
    </Card>
  );
}

function RecordForm({
  slug,
  athleteId,
  row,
  today,
  onDone,
}: {
  slug: string;
  athleteId: string;
  row: DocumentRow;
  today: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await recordDocumentAction(slug, athleteId, prev, form);
    if (result.ok) onDone();
    return result;
  }, {});
  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-3 border-t border-line pt-3">
      <input type="hidden" name="documentTypeId" value={row.typeId} />
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Field
          label="Fecha de expedición"
          hint={row.validityMonths ? `Vigencia: ${row.validityMonths} meses` : "No vence"}
          error={state.errors?.issuedOn?.[0]}
        >
          <Input type="date" name="issuedOn" defaultValue={today} max={today} required />
        </Field>
        <Field label="Notas" hint="Opcional">
          <Input name="notes" maxLength={200} placeholder="Ej.: apto para competencia" />
        </Field>
      </div>
      <AttachedFileField slug={slug} kind="ATHLETE_DOCUMENT" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? "Guardando…" : "Guardar documento"}
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={onDone}>
          Cancelar
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

function RemoveDocument({
  slug,
  athleteId,
  documentId,
  name,
}: {
  slug: string;
  athleteId: string;
  documentId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <IconButton
      disabled={pending}
      title="Quitar registro"
      aria-label={`Quitar ${name}`}
      onClick={() => {
        if (confirm(`¿Quitar el registro de "${name}"? También se borra el soporte.`)) {
          startTransition(() => void removeDocumentAction(slug, athleteId, documentId));
        }
      }}
    >
      <Trash className="size-4" />
    </IconButton>
  );
}

const CONSENT_OPTIONS = [
  { value: "GRANTED", label: "Autoriza" },
  { value: "DENIED", label: "No autoriza" },
  { value: null, label: "Sin respuesta" },
] as const;

/** ADM-71: la autorización de uso de imagen va aparte del resto de consentimientos. */
function ImageConsent({
  slug,
  athleteId,
  value,
}: {
  slug: string;
  athleteId: string;
  value: "GRANTED" | "DENIED" | null;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="text-sm font-semibold">Uso de imagen (fotos y videos en redes)</p>
      <div
        className="mt-2 flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="Autorización de uso de imagen"
      >
        {CONSENT_OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={pending}
            onClick={() => startTransition(() => void setImageConsentAction(slug, athleteId, o.value))}
            className={cn(
              "h-9 rounded-full px-3.5 text-sm font-semibold transition",
              value === o.value
                ? o.value === "DENIED"
                  ? "bg-danger/12 text-danger"
                  : "bg-brand/12 text-brand-strong"
                : "border border-line bg-surface text-ink-soft",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
