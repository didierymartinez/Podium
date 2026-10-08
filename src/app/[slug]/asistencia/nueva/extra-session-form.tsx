"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle, Select, cn } from "@/components/ui";
import type { ActionState } from "../../action-context";
import { extraSessionAction } from "../actions";

type GroupOption = { id: string; name: string; color: string; members: { id: string; name: string }[] };

export function ExtraSessionForm({
  slug,
  date,
  initialGroupId,
  groups,
}: {
  slug: string;
  date: string;
  initialGroupId: string;
  groups: GroupOption[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    extraSessionAction.bind(null, slug),
    {},
  );
  const [groupId, setGroupId] = useState(initialGroupId);
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const group = groups.find((g) => g.id === groupId);
  const error = (k: string) => state.errors?.[k]?.[0];

  return (
    <form onSubmit={submitWithoutReset(action)}>
      {!everyone && picked.map((id) => <input key={id} type="hidden" name="athleteIds" value={id} />)}
      <fieldset disabled={pending} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="space-y-4">
          <Field label="Grupo" error={error("groupId")}>
            <Select
              name="groupId"
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setPicked([]);
              }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fecha" error={error("date")}>
              <Input type="date" name="date" defaultValue={date} required />
            </Field>
            <Field label="Desde" error={error("startTime")}>
              <Input type="time" name="startTime" defaultValue="16:00" required />
            </Field>
            <Field label="Hasta" error={error("endTime")}>
              <Input type="time" name="endTime" defaultValue="18:00" required />
            </Field>
          </div>
          <Field label="Nota para profesores y familias" hint="Opcional" error={error("note")}>
            <Input name="note" maxLength={120} placeholder="Clase de reposición por la lluvia del martes" />
          </Field>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit">{pending ? "Creando…" : "Crear clase extra"}</Button>
            <FormStatus state={state} />
          </div>
        </Card>
        <Card className="space-y-3 lg:self-start">
          <SectionTitle>¿Quiénes van?</SectionTitle>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Quiénes van">
            {[
              { value: true, label: "Todo el grupo" },
              { value: false, label: "Elegir alumnos" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={everyone === o.value}
                onClick={() => setEveryone(o.value)}
                className={cn(
                  "h-9 rounded-full px-3.5 text-sm font-semibold",
                  everyone === o.value
                    ? "bg-brand/12 text-brand-strong"
                    : "border border-line bg-surface text-ink-soft",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {!everyone && (
            <ul className="max-h-80 space-y-1 overflow-y-auto" aria-label="Alumnos citados">
              {(group?.members ?? []).map((m) => (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      checked={picked.includes(m.id)}
                      onChange={(e) =>
                        setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((id) => id !== m.id)))
                      }
                    />
                    {m.name}
                  </label>
                </li>
              ))}
              {group?.members.length === 0 && (
                <li className="text-sm text-ink-soft">El grupo no tiene alumnos.</li>
              )}
            </ul>
          )}
        </Card>
      </fieldset>
    </form>
  );
}
