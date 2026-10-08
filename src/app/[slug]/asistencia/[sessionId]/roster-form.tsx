"use client";

import { Cake, CheckCheck, Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Avatar, Button, Card, Chip, Input, cn } from "@/components/ui";
import type { RosterEntry } from "@/modules/attendance/attendance";
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, type AttendanceStatus } from "@/modules/attendance/labels";
import type { ActionState } from "../../action-context";
import { saveAttendanceAction } from "../actions";

const TONES: Record<AttendanceStatus, string> = {
  PRESENT: "bg-mint text-white",
  LATE: "bg-sun text-[#1f1a05]",
  ABSENT: "bg-danger text-white",
  EXCUSED: "bg-violet text-white",
};

type Mark = { status: AttendanceStatus | null; excuseReason: string };

export function RosterForm({
  slug,
  sessionId,
  roster,
  readOnly,
}: {
  slug: string;
  sessionId: string;
  roster: RosterEntry[];
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveAttendanceAction.bind(null, slug, sessionId),
    {},
  );
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(
      roster.map((r) => [r.athleteId, { status: r.status, excuseReason: r.excuseReason ?? "" }]),
    ),
  );
  const set = (id: string, patch: Partial<Mark>) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  const entries = Object.entries(marks)
    .filter(([, m]) => m.status)
    .map(([athleteId, m]) => ({ athleteId, status: m.status, excuseReason: m.excuseReason || null }));
  const counts = ATTENDANCE_STATUSES.map((s) => [s, entries.filter((e) => e.status === s).length] as const);
  const missing = roster.length - entries.length;

  function allPresent() {
    setMarks((m) =>
      Object.fromEntries(
        Object.entries(m).map(([id, mark]) => [
          id,
          mark.status === "EXCUSED" ? mark : { status: "PRESENT" as const, excuseReason: "" },
        ]),
      ),
    );
  }

  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-3">
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />
      <Card className="p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          {counts.map(([s, n]) => (
            <Chip key={s} className={n ? TONES[s] : undefined}>
              {ATTENDANCE_LABELS[s].long} {n}
            </Chip>
          ))}
          {missing > 0 && <Chip tone="sun">Sin marcar {missing}</Chip>}
          {!readOnly && (
            <Button type="button" variant="secondary" className="ml-auto h-9 px-4" onClick={allPresent}>
              <CheckCheck className="size-4" /> Todos presentes
            </Button>
          )}
        </div>
        <ul className="divide-y divide-line" aria-label="Alumnos">
          {roster.map((r) => {
            const name = `${r.firstName} ${r.lastName}`;
            const mark = marks[r.athleteId];
            return (
              <li key={r.athleteId} className="flex flex-wrap items-center gap-3 px-1 py-3">
                <Avatar name={name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{name}</p>
                  <p className="flex flex-wrap gap-1.5">
                    {r.birthday && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet">
                        <Cake className="size-3.5" /> Cumpleaños
                      </span>
                    )}
                    {r.trial && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                        <Sparkles className="size-3.5" /> Preinscrito
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1.5" role="radiogroup" aria-label={`Asistencia de ${name}`}>
                  {ATTENDANCE_STATUSES.map((s) => {
                    const active = mark.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={ATTENDANCE_LABELS[s].long}
                        title={ATTENDANCE_LABELS[s].long}
                        disabled={readOnly}
                        onClick={() => set(r.athleteId, { status: active ? null : s })}
                        className={cn(
                          "grid size-11 place-items-center rounded-2xl text-sm font-bold transition disabled:cursor-not-allowed",
                          active
                            ? cn(TONES[s], "shadow-pill")
                            : "border border-line bg-surface text-ink-soft",
                        )}
                      >
                        {ATTENDANCE_LABELS[s].short}
                      </button>
                    );
                  })}
                </div>
                {mark.status === "EXCUSED" && (
                  <Input
                    aria-label={`Motivo de la excusa de ${name}`}
                    placeholder="Motivo (opcional): cita médica, viaje…"
                    value={mark.excuseReason}
                    maxLength={120}
                    disabled={readOnly}
                    onChange={(e) => set(r.athleteId, { excuseReason: e.target.value })}
                    className="basis-full"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      {!readOnly && (
        <div className="sticky bottom-24 z-10 flex flex-wrap items-center gap-3 rounded-3xl border border-line bg-glass p-3 shadow-soft backdrop-blur-md md:bottom-4">
          <Button type="submit" disabled={pending || entries.length === 0}>
            {pending ? "Guardando…" : "Guardar asistencia"}
          </Button>
          <FormStatus state={state} />
        </div>
      )}
    </form>
  );
}
