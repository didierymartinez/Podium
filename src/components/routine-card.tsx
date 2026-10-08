"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { logWorkoutAction, saveRoutineAction } from "@/app/[slug]/alumnos/routine-actions";
import { LineChart } from "./line-chart";
import { Alert, Button, Card, Field, IconButton, Input, SectionTitle, Select } from "./ui";

type Exercise = {
  name: string;
  sets: number;
  reps: string;
  weightKg: number | null;
  restSeconds: number | null;
};
type Day = { id?: string; name: string; exercises: Exercise[] };
type Routine = { name: string; notes: string | null; days: Day[] } | null;
type Progress = {
  name: string;
  points: { date: string; maxWeight: number; volume: number; oneRepMax: number }[];
};
type Workout = {
  id: string;
  performedOn: string;
  dayName: string | null;
  byFamily: boolean;
  sets: { id: string; exerciseName: string; reps: number; weightKg: number | null }[];
};

const kg = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg`;
const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

/** Rutina individual, registro del entreno y progreso (#73). `staff` edita la rutina; `family` solo registra. */
export function RoutineCard({
  slug,
  athleteId,
  firstName,
  mode,
  today,
  routine,
  progress,
  workouts,
}: {
  slug: string;
  athleteId: string;
  firstName: string;
  mode: "staff" | "family";
  today: string;
  routine: Routine;
  progress: Progress[];
  workouts: Workout[];
}) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [chart, setChart] = useState(progress[0]?.name ?? "");
  // Si aún no se eligió (o no existía al cargar), se muestra el primer ejercicio con datos.
  const selected = progress.find((p) => p.name === chart) ?? progress[0];
  const show = (r: { ok: boolean; message?: string }) =>
    setMessage(r.message ? { tone: r.ok ? "info" : "danger", text: r.message } : null);

  return (
    <Card
      className="space-y-4"
      aria-label={mode === "family" ? `Rutina de ${firstName}` : "Rutina y entrenos"}
    >
      <SectionTitle
        action={
          mode === "staff" ? (
            <Button variant="ghost" className="h-8" onClick={() => setEditing((e) => !e)}>
              {editing ? "Cerrar" : routine ? "Editar rutina" : "Crear rutina"}
            </Button>
          ) : undefined
        }
      >
        {mode === "family" ? `Rutina de ${firstName}` : "Rutina y entrenos"}
      </SectionTitle>
      {editing && mode === "staff" ? (
        <RoutineBuilder
          initial={routine}
          onSave={async (input) => {
            const r = await saveRoutineAction(slug, athleteId, input);
            show(r);
            if (r.ok) setEditing(false);
          }}
        />
      ) : routine ? (
        <div className="space-y-2 text-sm">
          <p className="font-semibold">{routine.name}</p>
          {routine.notes && <p className="text-ink-soft">{routine.notes}</p>}
          {routine.days.map((d) => (
            <div key={d.id ?? d.name}>
              <p className="font-semibold text-ink-soft">{d.name}</p>
              <ul className="ml-4 list-disc">
                {d.exercises.map((e, i) => (
                  <li key={i}>
                    {e.name}: {e.sets} × {e.reps}
                    {e.weightKg ? ` · ${kg(e.weightKg)}` : ""}
                    {e.restSeconds ? ` · descanso ${e.restSeconds} s` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-soft">Aún no tiene rutina asignada.</p>
      )}

      {routine && (
        <WorkoutForm
          today={today}
          days={routine.days}
          onSave={async (input) => show(await logWorkoutAction(slug, athleteId, input))}
        />
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {progress.length > 0 && (
        <div className="space-y-2">
          <Select
            aria-label="Ejercicio para la gráfica"
            className="w-auto"
            value={chart}
            onChange={(e) => setChart(e.target.value)}
          >
            {progress.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </Select>
          {selected && (
            <>
              <p className="text-sm">
                1RM estimado:{" "}
                <span className="font-semibold">
                  {kg(selected.points[selected.points.length - 1].oneRepMax)}
                </span>
                {" · "}peso máximo {kg(Math.max(...selected.points.map((p) => p.maxWeight)))}
              </p>
              <LineChart
                title={`1RM estimado de ${selected.name}`}
                points={selected.points.map((p) => ({ label: p.date, value: p.oneRepMax }))}
                format={kg}
              />
            </>
          )}
        </div>
      )}
      {workouts.length > 0 && (
        <ul className="divide-y divide-line text-sm" aria-label="Entrenos registrados">
          {workouts.map((w) => (
            <li key={w.id} className="py-1.5">
              <span className="font-semibold">{w.performedOn}</span>
              {w.dayName ? ` · ${w.dayName}` : ""}
              {w.byFamily ? " · registrado por la familia" : ""}
              <span className="block text-ink-soft">
                {[...new Set(w.sets.map((s) => s.exerciseName))]
                  .map((name) => {
                    const sets = w.sets.filter((s) => s.exerciseName === name);
                    return `${name} ${sets.map((s) => `${s.reps}${s.weightKg ? `×${s.weightKg}` : ""}`).join(", ")}`;
                  })
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RoutineBuilder({
  initial,
  onSave,
}: {
  initial: Routine;
  onSave: (input: unknown) => Promise<void>;
}) {
  const blank = (): Exercise => ({ name: "", sets: 3, reps: "10", weightKg: null, restSeconds: 60 });
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [days, setDays] = useState<Day[]>(
    initial?.days.map((d) => ({ name: d.name, exercises: d.exercises })) ?? [
      { name: "Día A", exercises: [blank()] },
    ],
  );
  const [pending, start] = useTransition();
  const patch = (di: number, ei: number, p: Partial<Exercise>) =>
    setDays((ds) =>
      ds.map((d, i) =>
        i !== di ? d : { ...d, exercises: d.exercises.map((e, j) => (j === ei ? { ...e, ...p } : e)) },
      ),
    );

  return (
    <form
      className="space-y-3"
      aria-label="Editar rutina"
      onSubmit={(e) => {
        e.preventDefault();
        start(() =>
          onSave({
            name,
            notes,
            days: days.map((d) => ({
              name: d.name,
              exercises: d.exercises.filter((x) => x.name.trim()).map((x) => ({ ...x, exerciseId: null })),
            })),
          }),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre de la rutina">
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Indicaciones">
          <Input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {days.map((d, di) => (
        <fieldset key={di} className="space-y-2 rounded-2xl bg-canvas p-3">
          <div className="flex items-center gap-2">
            <Input
              aria-label={`Nombre del día ${di + 1}`}
              className="w-40"
              value={d.name}
              onChange={(e) =>
                setDays((ds) => ds.map((x, i) => (i === di ? { ...x, name: e.target.value } : x)))
              }
            />
            <IconButton
              aria-label={`Quitar día ${di + 1}`}
              onClick={() => setDays((ds) => ds.filter((_, i) => i !== di))}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
          {d.exercises.map((x, ei) => (
            <div key={ei} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_70px_80px_90px_90px]">
              <Input
                aria-label={`Ejercicio ${ei + 1} del día ${di + 1}`}
                placeholder="Ejercicio"
                value={x.name}
                onChange={(e) => patch(di, ei, { name: e.target.value })}
              />
              <Input
                aria-label="Series"
                type="number"
                min={1}
                max={20}
                value={x.sets}
                onChange={(e) => patch(di, ei, { sets: Number(e.target.value) || 1 })}
              />
              <Input
                aria-label="Repeticiones"
                value={x.reps}
                onChange={(e) => patch(di, ei, { reps: e.target.value })}
              />
              <Input
                aria-label="Peso (kg)"
                inputMode="decimal"
                placeholder="kg"
                value={x.weightKg ?? ""}
                onChange={(e) => patch(di, ei, { weightKg: num(e.target.value) })}
              />
              <Input
                aria-label="Descanso (s)"
                inputMode="numeric"
                placeholder="s"
                value={x.restSeconds ?? ""}
                onChange={(e) => patch(di, ei, { restSeconds: num(e.target.value) })}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="h-8"
            onClick={() =>
              setDays((ds) =>
                ds.map((x, i) => (i === di ? { ...x, exercises: [...x.exercises, blank()] } : x)),
              )
            }
          >
            <Plus className="size-4" /> Ejercicio
          </Button>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            setDays((ds) => [
              ...ds,
              { name: `Día ${String.fromCharCode(65 + ds.length)}`, exercises: [blank()] },
            ])
          }
        >
          <Plus className="size-4" /> Día
        </Button>
        <Button type="submit" disabled={pending}>
          Guardar rutina
        </Button>
      </div>
    </form>
  );
}

function WorkoutForm({
  today,
  days,
  onSave,
}: {
  today: string;
  days: Day[];
  onSave: (input: unknown) => Promise<void>;
}) {
  const [dayIndex, setDayIndex] = useState(0);
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Record<string, { reps: string; weight: string }>>({});
  const [pending, start] = useTransition();
  const day = days[dayIndex];
  const rows = day
    ? day.exercises.flatMap((e) =>
        Array.from({ length: e.sets }, (_, i) => ({ key: `${e.name}#${i}`, exercise: e, set: i + 1 })),
      )
    : [];
  return (
    <form
      className="space-y-2 border-t border-line pt-3"
      aria-label="Registrar entreno"
      onSubmit={(e) => {
        e.preventDefault();
        const sets = rows
          .filter((r) => values[r.key]?.reps?.trim())
          .map((r) => ({
            exerciseName: r.exercise.name,
            reps: Number(values[r.key].reps) || 0,
            weightKg: num(values[r.key].weight ?? ""),
          }));
        start(async () => {
          await onSave({ routineDayId: day?.id ?? null, performedOn: date, sets });
          setValues({});
        });
      }}
    >
      <p className="font-semibold">Registrar entreno</p>
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="Día de la rutina"
          className="w-auto"
          value={dayIndex}
          onChange={(e) => setDayIndex(Number(e.target.value))}
        >
          {days.map((d, i) => (
            <option key={i} value={i}>
              {d.name}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Fecha del entreno"
          type="date"
          className="w-auto"
          max={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-2">
            <span className="min-w-40 flex-1">
              {r.exercise.name} · serie {r.set}
            </span>
            <Input
              aria-label={`Repeticiones de ${r.exercise.name} serie ${r.set}`}
              className="h-9 w-20"
              inputMode="numeric"
              placeholder={r.exercise.reps}
              value={values[r.key]?.reps ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [r.key]: { ...v[r.key], reps: e.target.value } }))}
            />
            <Input
              aria-label={`Peso de ${r.exercise.name} serie ${r.set}`}
              className="h-9 w-20"
              inputMode="decimal"
              placeholder={r.exercise.weightKg ? String(r.exercise.weightKg) : "kg"}
              value={values[r.key]?.weight ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [r.key]: { ...v[r.key], weight: e.target.value } }))}
            />
          </li>
        ))}
      </ul>
      <Button type="submit" variant="secondary" disabled={pending}>
        Guardar entreno
      </Button>
    </form>
  );
}
