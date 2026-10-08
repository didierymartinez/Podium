"use client";

import { Cake, CheckCheck, CloudUpload, FileWarning, HeartPulse, Sparkles, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { FormStatus } from "@/components/form-status";
import { idbDelete, idbGet, idbSet } from "@/lib/offline/idb";
import {
  isNetworkError,
  OUTBOX_EVENT,
  pendingFor,
  queueAttendance,
  type PendingAttendance,
} from "@/lib/offline/outbox";
import { Alert, Avatar, Button, Card, Chip, Input, cn } from "@/components/ui";
import { canRecordAttendance } from "@/modules/attendance/window";
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

const BLOCKED: Record<string, string> = {
  not_coach: "Solo los profesores de este grupo pueden tomar la asistencia.",
  too_early: "La asistencia se abre 1 hora antes de la clase.",
  window_closed: "Pasaron más de 48 horas desde la clase: solo la administración puede corregirla.",
};

export function RosterForm({
  slug,
  sessionId,
  roster,
  canceled,
  access,
}: {
  slug: string;
  sessionId: string;
  roster: (RosterEntry & { photoUrl: string | null; overdue: boolean })[];
  canceled: boolean;
  access: { isManager: boolean; isGroupCoach: boolean; start: string; end: string };
}) {
  // Se evalúa en el celular con la hora actual: la página puede abrirse guardada y sin señal.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const permission = canRecordAttendance({
    isManager: access.isManager,
    isGroupCoach: access.isGroupCoach,
    sessionStart: new Date(access.start),
    sessionEnd: new Date(access.end),
    now,
  });
  const readOnly = canceled || !permission.allowed;
  const router = useRouter();
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const [queued, setQueued] = useState<PendingAttendance | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(
      roster.map((r) => [r.athleteId, { status: r.status, excuseReason: r.excuseReason ?? "" }]),
    ),
  );
  const applyMarks = (entries: { athleteId: string; status: string; excuseReason: string | null }[]) =>
    setMarks((m) => {
      const next = { ...m };
      for (const e of entries) {
        if (next[e.athleteId]) {
          next[e.athleteId] = { status: e.status as AttendanceStatus, excuseReason: e.excuseReason ?? "" };
        }
      }
      return next;
    });
  const set = (id: string, patch: Partial<Mark>) =>
    setMarks((m) => {
      const next = { ...m, [id]: { ...m[id], ...patch } };
      // Borrador en el celular: si se cierra la página sin guardar, no se pierde lo marcado.
      void idbSet("drafts", sessionId, next).catch(() => {});
      return next;
    });

  // Al abrir: lo pendiente de sincronizar o el borrador tienen prioridad sobre lo que trajo el servidor.
  useEffect(() => {
    let active = true;
    async function load() {
      const item = await pendingFor(sessionId).catch(() => undefined);
      if (!active) return;
      if (queued && !item) {
        setQueued(null);
        setState({ ok: true, message: "Asistencia sincronizada" });
        router.refresh();
        return;
      }
      if (item) {
        setQueued(item);
        applyMarks(item.entries);
        return;
      }
      const draft = await idbGet<Record<string, Mark>>("drafts", sessionId).catch(() => undefined);
      if (active && draft)
        setMarks((m) => ({ ...m, ...Object.fromEntries(Object.entries(draft).filter(([id]) => id in m)) }));
    }
    void load();
    window.addEventListener(OUTBOX_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(OUTBOX_EVENT, load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo depende de la clase y del estado de la cola
  }, [sessionId, queued]);

  async function queue(recordedAt: string) {
    await queueAttendance({ sessionId, slug, entries, recordedAt });
    await idbDelete("drafts", sessionId).catch(() => {});
    setState({ ok: true, message: "Guardada en el celular. Se enviará al volver la señal." });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const recordedAt = new Date().toISOString();
    const form = new FormData();
    form.set("entries", JSON.stringify(entries));
    startTransition(async () => {
      if (!navigator.onLine) return queue(recordedAt);
      try {
        const result = await saveAttendanceAction(slug, sessionId, {}, form);
        setState(result);
        if (result.ok) await idbDelete("drafts", sessionId).catch(() => {});
      } catch (err) {
        if (isNetworkError(err)) await queue(recordedAt);
        else setState({ ok: false, message: "No se pudo guardar. Intenta de nuevo." });
      }
    });
  }
  const entries = Object.entries(marks).flatMap(([athleteId, m]) =>
    m.status ? [{ athleteId, status: m.status, excuseReason: m.excuseReason || null }] : [],
  );
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
    <form onSubmit={onSubmit} className="space-y-3">
      {!canceled && permission.reason && <Alert tone="info">{BLOCKED[permission.reason]}</Alert>}
      {queued && (
        <div role="status" className="flex items-center gap-2 rounded-2xl bg-sun/30 px-4 py-3 text-sm">
          <CloudUpload className="size-4 shrink-0" />
          <span>
            <strong>Pendiente de sincronizar.</strong> Se guardó en el celular y se enviará al volver la
            señal.
            {queued.lastError && ` No se pudo enviar: ${queued.lastError}`}
          </span>
        </div>
      )}
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
                <Avatar name={name} size={40} src={r.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{name}</p>
                  <p className="flex flex-wrap gap-1.5">
                    {r.birthday && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet">
                        <Cake className="size-3.5" /> Cumpleaños
                      </span>
                    )}
                    {r.overdue && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
                        <Wallet className="size-3.5" /> En mora
                      </span>
                    )}
                    {r.medicalNote && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
                        <HeartPulse className="size-3.5" /> Nota médica
                      </span>
                    )}
                    {r.documentIssue && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
                        <FileWarning className="size-3.5" />{" "}
                        {r.documentIssue === "expired" ? "Documento vencido" : "Documentos pendientes"}
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
