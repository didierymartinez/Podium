import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import {
  athletes,
  auditLogs,
  routineDays,
  routineExercises,
  routines,
  workoutLogs,
  workoutSets,
} from "@/db/schema";
import type { IsoDate } from "@/lib/dates";

/** Rutinas individuales, registro del entreno y progreso (EVALUACION_GIMNASIOS §4 y §6.1). */

type Ctx = { schoolId: string; actorUserId: string };

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const routineSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de la rutina").max(80),
  notes: optional(500),
  days: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Escribe el nombre del día").max(40),
        exercises: z
          .array(
            z.object({
              exerciseId: z.uuid().nullable(),
              name: z.string().trim().min(2).max(80),
              sets: z.number().int().min(1).max(20),
              reps: z.string().trim().min(1).max(20),
              weightKg: z.number().min(0).max(1000).nullable(),
              restSeconds: z.number().int().min(0).max(1800).nullable(),
              notes: optional(200),
            }),
          )
          .min(1, "Cada día necesita al menos un ejercicio")
          .max(20),
      }),
    )
    .min(1, "Agrega al menos un día")
    .max(7),
});

/** Guarda la rutina del alumno (reemplaza la activa: queda una sola). */
export function saveRoutine(
  database: Database,
  ctx: Ctx,
  athleteId: string,
  raw: z.input<typeof routineSchema>,
) {
  const input = routineSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [athlete] = await tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.id, athleteId));
    if (!athlete) return null;
    await tx
      .update(routines)
      .set({ active: false })
      .where(and(eq(routines.athleteId, athleteId), eq(routines.active, true)));
    const [routine] = await tx
      .insert(routines)
      .values({
        schoolId: ctx.schoolId,
        athleteId,
        name: input.name,
        notes: input.notes,
        createdByUserId: ctx.actorUserId,
      })
      .returning({ id: routines.id });
    for (const [i, day] of input.days.entries()) {
      const [d] = await tx
        .insert(routineDays)
        .values({ schoolId: ctx.schoolId, routineId: routine.id, name: day.name, position: i + 1 })
        .returning({ id: routineDays.id });
      await tx
        .insert(routineExercises)
        .values(
          day.exercises.map((e, j) => ({ schoolId: ctx.schoolId, dayId: d.id, ...e, position: j + 1 })),
        );
    }
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "routine.saved",
      entity: "athlete",
      entityId: athleteId,
      data: { routineId: routine.id, days: input.days.length },
    });
    return routine.id;
  });
}

/** Rutina activa con sus días y ejercicios (en el portal va dentro de `asPortalUser`). */
export function activeRoutine(database: Database, schoolId: string, athleteId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [routine] = await tx
      .select()
      .from(routines)
      .where(and(eq(routines.athleteId, athleteId), eq(routines.active, true)));
    if (!routine) return null;
    const days = await tx
      .select()
      .from(routineDays)
      .where(eq(routineDays.routineId, routine.id))
      .orderBy(asc(routineDays.position));
    const items = days.length
      ? await tx
          .select()
          .from(routineExercises)
          .where(
            inArray(
              routineExercises.dayId,
              days.map((d) => d.id),
            ),
          )
          .orderBy(asc(routineExercises.position))
      : [];
    return {
      ...routine,
      days: days.map((d) => ({ ...d, exercises: items.filter((e) => e.dayId === d.id) })),
    };
  });
}

export const workoutSchema = z.object({
  routineDayId: z.uuid().nullable(),
  performedOn: z.iso.date("Escribe la fecha"),
  notes: optional(300),
  sets: z
    .array(
      z.object({
        exerciseName: z.string().trim().min(2).max(80),
        reps: z.number().int().min(0).max(500),
        weightKg: z.number().min(0).max(1000).nullable(),
      }),
    )
    .min(1, "Registra al menos una serie")
    .max(200),
});

/**
 * Registra un entreno. `byFamily` marca lo que registró el alumno o su familia desde el portal (va dentro
 * de `asPortalUser`: solo para sus hijos).
 */
export function logWorkout(
  database: Database,
  ctx: Ctx,
  athleteId: string,
  raw: z.input<typeof workoutSchema>,
  opts: { today: IsoDate; byFamily: boolean },
) {
  const input = workoutSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    if (input.performedOn > opts.today) return null;
    const [athlete] = await tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.id, athleteId));
    if (!athlete) return null;
    const [log] = await tx
      .insert(workoutLogs)
      .values({
        schoolId: ctx.schoolId,
        athleteId,
        routineDayId: input.routineDayId,
        performedOn: input.performedOn,
        notes: input.notes,
        byFamily: opts.byFamily,
        createdByUserId: ctx.actorUserId,
      })
      .returning({ id: workoutLogs.id });
    const counter = new Map<string, number>();
    await tx.insert(workoutSets).values(
      input.sets.map((s) => {
        const n = (counter.get(s.exerciseName) ?? 0) + 1;
        counter.set(s.exerciseName, n);
        return { schoolId: ctx.schoolId, logId: log.id, athleteId, ...s, setNumber: n };
      }),
    );
    return log.id;
  });
}

/** 1RM estimado (Epley): peso × (1 + reps / 30). */
export const estimatedOneRepMax = (weightKg: number, reps: number) =>
  reps <= 0 ? 0 : reps === 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10;

export type ExerciseProgress = {
  name: string;
  points: { date: IsoDate; maxWeight: number; volume: number; oneRepMax: number }[];
};

/** Progreso por ejercicio a partir de las series con peso. */
export function workoutProgress(database: Database, schoolId: string, athleteId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({
        date: workoutLogs.performedOn,
        name: workoutSets.exerciseName,
        reps: workoutSets.reps,
        weightKg: workoutSets.weightKg,
      })
      .from(workoutSets)
      .innerJoin(workoutLogs, eq(workoutLogs.id, workoutSets.logId))
      .where(eq(workoutSets.athleteId, athleteId))
      .orderBy(asc(workoutLogs.performedOn));
    const byExercise = new Map<
      string,
      Map<IsoDate, { maxWeight: number; volume: number; oneRepMax: number }>
    >();
    for (const r of rows) {
      if (r.weightKg === null || r.weightKg <= 0) continue;
      const days = byExercise.get(r.name) ?? new Map();
      const p = days.get(r.date) ?? { maxWeight: 0, volume: 0, oneRepMax: 0 };
      p.maxWeight = Math.max(p.maxWeight, r.weightKg);
      p.volume += r.reps * r.weightKg;
      p.oneRepMax = Math.max(p.oneRepMax, estimatedOneRepMax(r.weightKg, r.reps));
      days.set(r.date, p);
      byExercise.set(r.name, days);
    }
    return [...byExercise.entries()].map(([name, days]): ExerciseProgress => ({
      name,
      points: [...days.entries()].map(([date, p]) => ({ date, ...p })),
    }));
  });
}

/** Últimos entrenos con sus series. */
export function recentWorkouts(database: Database, schoolId: string, athleteId: string, limit = 5) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const logs = await tx
      .select({ log: workoutLogs, dayName: routineDays.name })
      .from(workoutLogs)
      .leftJoin(routineDays, eq(routineDays.id, workoutLogs.routineDayId))
      .where(eq(workoutLogs.athleteId, athleteId))
      .orderBy(desc(workoutLogs.performedOn), desc(workoutLogs.createdAt))
      .limit(limit);
    const sets = logs.length
      ? await tx
          .select()
          .from(workoutSets)
          .where(
            inArray(
              workoutSets.logId,
              logs.map((l) => l.log.id),
            ),
          )
          .orderBy(asc(workoutSets.exerciseName), asc(workoutSets.setNumber))
      : [];
    return logs.map((l) => ({
      ...l.log,
      dayName: l.dayName,
      sets: sets.filter((s) => s.logId === l.log.id),
    }));
  });
}
