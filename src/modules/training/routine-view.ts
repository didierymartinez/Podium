import type { activeRoutine, recentWorkouts, workoutProgress } from "./routines";

/** Datos serializables para `RoutineCard`. */
export function toRoutineView(
  routine: Awaited<ReturnType<typeof activeRoutine>>,
  progress: Awaited<ReturnType<typeof workoutProgress>>,
  workouts: Awaited<ReturnType<typeof recentWorkouts>>,
) {
  return {
    routine: routine && {
      name: routine.name,
      notes: routine.notes,
      days: routine.days.map((d) => ({
        id: d.id,
        name: d.name,
        exercises: d.exercises.map((e) => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          weightKg: e.weightKg,
          restSeconds: e.restSeconds,
        })),
      })),
    },
    progress,
    workouts: workouts.map((w) => ({
      id: w.id,
      performedOn: w.performedOn,
      dayName: w.dayName,
      byFamily: w.byFamily,
      sets: w.sets.map((s) => ({
        id: s.id,
        exerciseName: s.exerciseName,
        reps: s.reps,
        weightKg: s.weightKg,
      })),
    })),
  };
}
