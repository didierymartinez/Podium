"use client";

import { Archive, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Chip, Field, IconButton, Input, SectionTitle, Tile, cn } from "@/components/ui";
import type { ActionState } from "../../action-context";
import { saveDocumentTypeAction, setDocumentTypeActiveAction } from "../../documentos/actions";

type TypeView = {
  id: string;
  name: string;
  required: boolean;
  validityMonths: number | null;
  active: boolean;
};

export function DocumentTypesCard({
  slug,
  canEdit,
  types,
}: {
  slug: string;
  canEdit: boolean;
  types: TypeView[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card className="max-w-3xl">
      <SectionTitle
        action={
          canEdit &&
          editing !== "new" && (
            <Button variant="secondary" className="h-9 px-4" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Nuevo documento
            </Button>
          )
        }
      >
        Documentos de los alumnos
      </SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Lo que pides a cada alumno matriculado. Si tiene vigencia, avisamos 30 días antes de que venza.
      </p>
      <ul className="space-y-2.5">
        {editing === "new" && (
          <li>
            <TypeEditor slug={slug} onDone={() => setEditing(null)} />
          </li>
        )}
        {types.map((t) =>
          editing === t.id ? (
            <li key={t.id}>
              <TypeEditor slug={slug} type={t} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={t.id}>
              <TypeRow slug={slug} type={t} canEdit={canEdit} onEdit={() => setEditing(t.id)} />
            </li>
          ),
        )}
      </ul>
    </Card>
  );
}

function TypeRow({
  slug,
  type,
  canEdit,
  onEdit,
}: {
  slug: string;
  type: TypeView;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Tile className={cn("flex flex-wrap items-center gap-3", !type.active && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{type.name}</p>
        <p className="text-sm text-ink-soft">
          {type.validityMonths ? `Vigencia de ${type.validityMonths} meses` : "No vence"}
        </p>
      </div>
      <Chip tone={type.required ? "brand" : "neutral"}>{type.required ? "Obligatorio" : "Opcional"}</Chip>
      {!type.active && <Chip>Archivado</Chip>}
      {canEdit && (
        <div className="flex gap-1.5">
          <IconButton onClick={onEdit} aria-label={`Editar ${type.name}`} title="Editar" disabled={pending}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton
            disabled={pending}
            aria-label={type.active ? `Archivar ${type.name}` : `Reactivar ${type.name}`}
            title={type.active ? "Archivar" : "Reactivar"}
            onClick={() =>
              startTransition(() => void setDocumentTypeActiveAction(slug, type.id, !type.active))
            }
          >
            {type.active ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}
          </IconButton>
        </div>
      )}
    </Tile>
  );
}

function TypeEditor({ slug, type, onDone }: { slug: string; type?: TypeView; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await saveDocumentTypeAction(slug, prev, form);
    if (result.ok) onDone();
    return result;
  }, {});
  const error = (key: string) => state.errors?.[key]?.[0];
  return (
    <Tile className="border-brand/30 bg-surface ring-4 ring-brand/8">
      <form onSubmit={submitWithoutReset(action)} className="space-y-4">
        {type && <input type="hidden" name="id" value={type.id} />}
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Nombre" error={error("name")}>
            <Input
              name="name"
              defaultValue={type?.name}
              required
              maxLength={60}
              placeholder="Póliza de accidentes"
              autoFocus
            />
          </Field>
          <Field label="Vigencia (meses)" hint="Vacío si no vence" error={error("validityMonths")}>
            <Input
              name="validityMonths"
              type="number"
              min={1}
              max={120}
              defaultValue={type?.validityMonths ?? ""}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="required"
            defaultChecked={type?.required ?? true}
            className="size-4 accent-brand"
          />
          Obligatorio para todos los alumnos
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? "Guardando…" : type ? "Guardar cambios" : "Crear documento"}
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
