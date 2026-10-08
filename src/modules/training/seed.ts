import type { Tx } from "@/db/rls";
import { exercises } from "@/db/schema";
import { commonExercisesFor, exercisesFor } from "./exercise-template";

/** Carga la biblioteca inicial: los comunes (una vez por escuela) y los de la modalidad. */
export async function seedExercises(
  tx: Tx,
  schoolId: string,
  discipline: { id: string; code: string },
  levels: { id: string; name: string }[],
  opts: { common: boolean },
) {
  const rows = [
    ...(opts.common
      ? commonExercisesFor(discipline.code).map((e) => ({
          ...e,
          disciplineId: null,
          levelIds: [] as string[],
        }))
      : []),
    ...exercisesFor(discipline.code).map((e) => ({
      ...e,
      disciplineId: discipline.id,
      levelIds: levels.filter((l) => e.levels.includes(l.name)).map((l) => l.id),
    })),
  ];
  if (rows.length === 0) return;
  await tx.insert(exercises).values(
    rows.map((e) => ({
      schoolId,
      disciplineId: e.disciplineId,
      levelIds: e.levelIds,
      name: e.name,
      component: e.component,
      minutes: e.minutes,
      materials: e.materials,
      space: e.space,
      description: e.description,
    })),
  );
}
