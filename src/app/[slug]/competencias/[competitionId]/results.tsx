"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Input, Select } from "@/components/ui";
import { MEDALS, MEDAL_LABELS, type Medal } from "@/modules/competitions/labels";
import { importResultsAction, saveResultAction, type ImportResultsState } from "../actions";

/** Resultado de un inscrito en una prueba (DEP-66). */
export function ResultEditor({
  slug,
  entryId,
  name,
  events,
}: {
  slug: string;
  entryId: string;
  name: string;
  events: string[];
}) {
  const [event, setEvent] = useState(events[0] ?? "");
  const [position, setPosition] = useState("");
  const [mark, setMark] = useState("");
  const [medal, setMedal] = useState<Medal | "">("");
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      aria-label={`Resultado de ${name}`}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveResultAction(slug, entryId, {
            event,
            position: position ? Number(position) : null,
            mark,
            medal: medal || null,
          });
          setSaved(r.ok);
          if (r.ok) {
            setPosition("");
            setMark("");
            setMedal("");
          }
        });
      }}
    >
      <Select
        aria-label="Prueba"
        className="h-9 w-auto"
        value={event}
        onChange={(e) => setEvent(e.target.value)}
      >
        {events.map((ev) => (
          <option key={ev} value={ev}>
            {ev}
          </option>
        ))}
      </Select>
      <Input
        aria-label="Posición"
        placeholder="Posición"
        inputMode="numeric"
        className="h-9 w-24"
        value={position}
        onChange={(e) => setPosition(e.target.value.replace(/\D/g, ""))}
      />
      <Input
        aria-label="Tiempo o puntos"
        placeholder="Tiempo o puntos"
        className="h-9 w-36"
        maxLength={40}
        value={mark}
        onChange={(e) => setMark(e.target.value)}
      />
      <Select
        aria-label="Medalla"
        className="h-9 w-auto"
        value={medal}
        onChange={(e) => setMedal(e.target.value as Medal | "")}
      >
        <option value="">Sin medalla</option>
        {MEDALS.map((m) => (
          <option key={m} value={m}>
            {MEDAL_LABELS[m]}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" className="h-9" disabled={pending}>
        Guardar resultado
      </Button>
      {saved === false && <span className="text-sm text-danger">No se pudo guardar.</span>}
    </form>
  );
}

export function ImportResultsForm({ slug, competitionId }: { slug: string; competitionId: string }) {
  const [state, action, pending] = useActionState<ImportResultsState, FormData>(
    importResultsAction.bind(null, slug, competitionId),
    {},
  );
  return (
    <form action={action} className="space-y-2">
      <input
        type="file"
        name="file"
        aria-label="Archivo de resultados"
        accept=".xlsx,.csv"
        className="block text-sm"
      />
      {state.message && <Alert tone={state.tone ?? "info"}>{state.message}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>
        Importar resultados
      </Button>
    </form>
  );
}
