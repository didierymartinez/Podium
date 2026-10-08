"use client";

import { Send } from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle, cn } from "@/components/ui";
import type { ActionState } from "../../action-context";
import { createAnnouncementAction } from "../actions";

type Option = { id: string; name: string; detail?: string };

const KINDS = {
  school: "Toda la escuela",
  groups: "Grupos",
  levels: "Niveles",
  categories: "Categorías por edad",
  debtors: "Familias con saldo vencido",
  people: "Personas elegidas",
} as const;

const VARIABLES = ["{acudiente}", "{alumnos}", "{grupo}", "{escuela}"];

export function AnnouncementEditor({
  slug,
  schoolName,
  manager,
  groups,
  levels,
  categories,
  people,
}: {
  slug: string;
  schoolName: string;
  manager: boolean;
  groups: Option[];
  levels: Option[];
  categories: Option[];
  people: Option[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createAnnouncementAction.bind(null, slug),
    {},
  );
  const [kind, setKind] = useState<keyof typeof KINDS>(manager ? "school" : "groups");
  const [ids, setIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("Hola {acudiente}, ");
  const [query, setQuery] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const options = useMemo(
    () =>
      kind === "groups"
        ? groups
        : kind === "levels"
          ? levels
          : kind === "categories"
            ? categories
            : kind === "people"
              ? people
              : [],
    [kind, groups, levels, categories, people],
  );
  const visibleOptions = useMemo(
    () =>
      kind === "people" && query
        ? options.filter((o) => `${o.name} ${o.detail}`.toLowerCase().includes(query.toLowerCase()))
        : options,
    [kind, options, query],
  );
  const preview = body
    .replaceAll("{acudiente}", "Laura")
    .replaceAll("{alumnos}", "Sofía y Tomás")
    .replaceAll("{grupo}", groups[0]?.name ?? "Iniciación")
    .replaceAll("{escuela}", schoolName);

  function insert(variable: string) {
    const el = textarea.current;
    if (!el) return setBody((b) => b + variable);
    const start = el.selectionStart ?? body.length;
    const next = body.slice(0, start) + variable + body.slice(el.selectionEnd ?? start);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  return (
    <form onSubmit={submitWithoutReset(action)}>
      <input type="hidden" name="audience" value={kind} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
      <fieldset disabled={pending} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="space-y-4">
          <SectionTitle>¿A quién?</SectionTitle>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Audiencia">
            {(Object.keys(KINDS) as (keyof typeof KINDS)[])
              .filter((k) => manager || k === "groups")
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => {
                    setKind(k);
                    setIds([]);
                  }}
                  className={cn(
                    "h-9 rounded-full px-3.5 text-sm font-semibold",
                    kind === k ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft",
                  )}
                >
                  {KINDS[k]}
                </button>
              ))}
          </div>
          {options.length > 0 && (
            <div className="space-y-2">
              {kind === "people" && (
                <Input
                  placeholder="Buscar acudiente o alumno"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Buscar personas"
                />
              )}
              <ul
                className="flex max-h-60 flex-wrap gap-1.5 overflow-y-auto"
                aria-label="Opciones de audiencia"
              >
                {visibleOptions.map((o) => {
                  const on = ids.includes(o.id);
                  return (
                    <li key={o.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                          on ? "border-brand bg-brand/8 font-semibold" : "border-line bg-surface",
                        )}
                        title={o.detail}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-brand"
                          checked={on}
                          onChange={(e) =>
                            setIds((v) => (e.target.checked ? [...v, o.id] : v.filter((x) => x !== o.id)))
                          }
                        />
                        {o.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <SectionTitle>Mensaje</SectionTitle>
          <Field label="Título" error={state.errors?.title?.[0]}>
            <Input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={80}
              placeholder="Mañana no hay clase"
            />
          </Field>
          <Field label="Texto" error={state.errors?.body?.[0]}>
            <textarea
              ref={textarea}
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={2000}
              rows={6}
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-soft">Insertar:</span>
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insert(v)}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold"
              >
                {v}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fijar en el inicio hasta" hint="Opcional">
              <Input type="date" name="pinnedUntil" />
            </Field>
            <label className="mt-6 flex items-start gap-2 text-sm">
              <input type="checkbox" name="urgent" className="mt-0.5 size-4 accent-brand" />
              <span>
                <strong>Urgente:</strong> se envía ya aunque sea fuera del horario (7 a. m. a 8 p. m.).
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit" disabled={kind !== "school" && kind !== "debtors" && ids.length === 0}>
              <Send className="size-4" /> {pending ? "Enviando…" : "Enviar aviso"}
            </Button>
            <FormStatus state={state} />
          </div>
        </Card>
        <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-sun/30 px-4 py-3 text-sm">
            <p className="font-semibold">Vista previa</p>
            <p className="text-ink-soft">Así lo verá una familia (con datos de ejemplo).</p>
          </div>
          <Card className="p-5" aria-label="Vista previa del aviso">
            <p className="text-xs font-semibold text-brand">{schoolName}</p>
            <p className="mt-1 text-lg font-semibold">{title || "Título del aviso"}</p>
            <p className="mt-2 whitespace-pre-line text-sm">{preview}</p>
          </Card>
          <p className="px-1 text-xs text-ink-soft">
            Llega por la app; por notificación push si la familia la activó, o si no por correo. Después
            puedes copiarlo para WhatsApp.
          </p>
        </div>
      </fieldset>
    </form>
  );
}
