"use client";

import { ExternalLink, Plus, Trash, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { AttachedFileField } from "@/components/attached-file-field";
import { DocumentStatusChip } from "@/components/document-status-chip";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, IconButton, Input, SectionTitle, Tile } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import type { DocumentStatus } from "@/modules/documents/status";
import type { ActionState } from "../../action-context";
import { addCertificationAction, removeCertificationAction } from "../../documentos/actions";

export type CertificationRow = {
  id: string;
  name: string;
  issuedOn: string | null;
  expiresOn: string | null;
  status: DocumentStatus;
  fileUrl: string | null;
};

export function CertificationsCard({
  slug,
  coachId,
  rows,
}: {
  slug: string;
  coachId: string;
  rows: CertificationRow[];
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <SectionTitle
        action={
          !adding && (
            <Button variant="secondary" className="h-9 px-4" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Agregar
            </Button>
          )
        }
      >
        Certificaciones
      </SectionTitle>
      {adding && <AddForm slug={slug} coachId={coachId} onDone={() => setAdding(false)} />}
      <ul className="space-y-2.5" aria-label="Certificaciones">
        {rows.map((c) => (
          <CertificationItem key={c.id} slug={slug} coachId={coachId} cert={c} />
        ))}
        {rows.length === 0 && !adding && (
          <Tile className="text-sm text-ink-soft">
            Primeros auxilios, curso de entrenador, licencia de la liga…
          </Tile>
        )}
      </ul>
    </Card>
  );
}

function CertificationItem({
  slug,
  coachId,
  cert,
}: {
  slug: string;
  coachId: string;
  cert: CertificationRow;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <li>
      <Tile className="flex flex-wrap items-center gap-2 p-3.5">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{cert.name}</p>
          <p className="text-xs text-ink-soft">
            {cert.expiresOn ? `Vence ${formatShortDate(cert.expiresOn)}` : "Sin vencimiento"}
            {cert.issuedOn && ` · expedida ${formatShortDate(cert.issuedOn)}`}
          </p>
        </div>
        <DocumentStatusChip status={cert.status} />
        {cert.fileUrl && (
          <a
            href={cert.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-ink-soft"
            aria-label={`Ver soporte de ${cert.name}`}
          >
            <ExternalLink className="size-4" />
          </a>
        )}
        <IconButton
          disabled={pending}
          aria-label={`Quitar ${cert.name}`}
          title="Quitar"
          onClick={() => startTransition(() => void removeCertificationAction(slug, coachId, cert.id))}
        >
          <Trash className="size-4" />
        </IconButton>
      </Tile>
    </li>
  );
}

function AddForm({ slug, coachId, onDone }: { slug: string; coachId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await addCertificationAction(slug, coachId, prev, form);
    if (result.ok) onDone();
    return result;
  }, {});
  const error = (key: string) => state.errors?.[key]?.[0];
  return (
    <Tile className="mb-3 border-brand/30 bg-surface ring-4 ring-brand/8">
      <form onSubmit={submitWithoutReset(action)} className="space-y-3">
        <Field label="Certificación" error={error("name")}>
          <Input name="name" required maxLength={80} placeholder="Primeros auxilios" autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Expedición" hint="Opcional" error={error("issuedOn")}>
            <Input type="date" name="issuedOn" />
          </Field>
          <Field label="Vencimiento" hint="Vacío si no vence" error={error("expiresOn")}>
            <Input type="date" name="expiresOn" />
          </Field>
        </div>
        <AttachedFileField slug={slug} kind="COACH_CERTIFICATE" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="h-10" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={onDone}>
            <X className="size-4" /> Cancelar
          </Button>
          <FormStatus state={state} />
        </div>
      </form>
    </Tile>
  );
}
