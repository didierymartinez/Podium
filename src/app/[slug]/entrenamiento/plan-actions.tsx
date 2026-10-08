"use client";

import { CalendarPlus, Copy, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Chip, IconButton, Input, Select } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { assignPlanAction, deletePlanAction, duplicatePlanAction, unassignPlanAction } from "./actions";

/** Asignar un plan a días de un grupo (DEP-31), duplicarlo (DEP-32) o borrarlo. */
export function PlanActions({
  slug,
  plan,
  today,
  groups,
  upcoming,
}: {
  slug: string;
  plan: { id: string; name: string };
  today: string;
  groups: { id: string; name: string }[];
  upcoming: { id: string; date: string; groupName: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [weeks, setWeeks] = useState("1");
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function assign() {
    const n = Math.min(12, Math.max(1, Number(weeks) || 1));
    const dates = Array.from({ length: n }, (_, i) => addDays(date, i * 7));
    start(async () => {
      const r = await assignPlanAction(slug, { planId: plan.id, groupId, dates });
      setMessage(
        r.ok
          ? { tone: "info", text: `Plan asignado a ${r.assigned} ${r.assigned === 1 ? "clase" : "clases"}.` }
          : {
              tone: "danger",
              text:
                r.error === "past" ? "Elige fechas desde hoy." : "No se pudo asignar el plan a ese grupo.",
            },
      );
    });
  }

  return (
    <div className="space-y-2">
      {upcoming.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Próximas clases con ${plan.name}`}>
          {upcoming.map((a) => (
            <li key={a.id}>
              <Chip tone="brand">
                {a.groupName} · {a.date}
                <button
                  type="button"
                  aria-label={`Quitar ${a.groupName} ${a.date}`}
                  disabled={pending}
                  onClick={() => start(async () => void (await unassignPlanAction(slug, a.id)))}
                >
                  <X className="size-3" />
                </button>
              </Chip>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="h-9"
          onClick={() => setOpen((o) => !o)}
          disabled={!groups.length}
        >
          <CalendarPlus className="size-4" /> Asignar a clases
        </Button>
        <Button
          variant="ghost"
          className="h-9"
          disabled={pending}
          aria-label={`Duplicar ${plan.name}`}
          onClick={() => start(async () => void (await duplicatePlanAction(slug, plan.id)))}
        >
          <Copy className="size-4" /> Duplicar
        </Button>
        <IconButton
          aria-label={`Borrar ${plan.name}`}
          disabled={pending}
          onClick={() => {
            if (confirm(`¿Borrar el plan "${plan.name}"? Se quita de las clases asignadas.`))
              start(async () => void (await deletePlanAction(slug, plan.id)));
          }}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-canvas p-3">
          <Select
            aria-label="Grupo"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-auto"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            aria-label="Desde"
            min={today}
            max={addDays(today, 365)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
          <Select
            aria-label="Repetir"
            value={weeks}
            onChange={(e) => setWeeks(e.target.value)}
            className="w-auto"
          >
            {[1, 2, 3, 4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Solo ese día" : `${n} semanas (mismo día)`}
              </option>
            ))}
          </Select>
          <Button className="h-11" disabled={pending || !groupId} onClick={assign}>
            Asignar
          </Button>
        </div>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
