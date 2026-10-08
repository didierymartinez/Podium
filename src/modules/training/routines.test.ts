import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asPortalUser } from "@/db/portal";
import { runInTenant } from "@/db/rls";
import { guardians } from "@/db/schema";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import {
  activeRoutine,
  estimatedOneRepMax,
  logWorkout,
  recentWorkouts,
  saveRoutine,
  workoutProgress,
} from "./routines";

describe("1RM estimado", () => {
  it("usa la fórmula de Epley", () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(60, 10)).toBe(80);
    expect(estimatedOneRepMax(50, 0)).toBe(0);
  });
});

describe.skipIf(!testDatabaseUrl)("rutinas y registro del entreno (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("el profesor asigna la rutina; la familia registra el entreno y se ve el progreso", async () => {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía");
    const otro = await f.athlete("Otro");
    const parent = await createTestUser(conn.db, "acudiente");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      const [first] = await tx.select().from(guardians).orderBy(asc(guardians.createdAt));
      await tx.update(guardians).set({ userId: parent.id }).where(eq(guardians.id, first.id));
    });

    const day = (name: string, exercise: string) => ({
      name,
      exercises: [{ exerciseId: null, name: exercise, sets: 3, reps: "8-10", weightKg: 40, restSeconds: 90 }],
    });
    await saveRoutine(conn.db, f.ctx, sofia, { name: "Fuerza 1", days: [day("Día A", "Sentadilla")] });
    const routineId = await saveRoutine(conn.db, f.ctx, sofia, {
      name: "Fuerza 2",
      days: [day("Día A", "Sentadilla"), day("Día B", "Peso muerto")],
    });
    const routine = await activeRoutine(conn.db, f.ctx.schoolId, sofia);
    expect(routine).toMatchObject({ id: routineId, name: "Fuerza 2" });
    expect(routine!.days.map((d) => [d.name, d.exercises[0].name])).toEqual([
      ["Día A", "Sentadilla"],
      ["Día B", "Peso muerto"],
    ]);

    const portal = <T>(fn: () => Promise<T>) => asPortalUser(parent.id, fn);
    const familyCtx = { ...f.ctx, actorUserId: parent.id };
    expect(await portal(() => activeRoutine(conn.db, f.ctx.schoolId, otro))).toBeNull();
    await portal(() =>
      logWorkout(
        conn.db,
        familyCtx,
        sofia,
        {
          routineDayId: routine!.days[0].id,
          performedOn: "2026-10-01",
          sets: [
            { exerciseName: "Sentadilla", reps: 10, weightKg: 40 },
            { exerciseName: "Sentadilla", reps: 8, weightKg: 45 },
          ],
        },
        { today: "2026-10-08", byFamily: true },
      ),
    );
    await logWorkout(
      conn.db,
      f.ctx,
      sofia,
      {
        routineDayId: null,
        performedOn: "2026-10-05",
        sets: [{ exerciseName: "Sentadilla", reps: 5, weightKg: 50 }],
      },
      { today: "2026-10-08", byFamily: false },
    );
    expect(
      await logWorkout(
        conn.db,
        f.ctx,
        sofia,
        {
          routineDayId: null,
          performedOn: "2026-12-01",
          sets: [{ exerciseName: "Remo", reps: 1, weightKg: 1 }],
        },
        { today: "2026-10-08", byFamily: false },
      ),
    ).toBeNull();

    const progress = await portal(() => workoutProgress(conn.db, f.ctx.schoolId, sofia));
    expect(progress).toEqual([
      {
        name: "Sentadilla",
        points: [
          { date: "2026-10-01", maxWeight: 45, volume: 760, oneRepMax: 57 },
          { date: "2026-10-05", maxWeight: 50, volume: 250, oneRepMax: 58.3 },
        ],
      },
    ]);
    const recent = await recentWorkouts(conn.db, f.ctx.schoolId, sofia);
    expect(recent.map((r) => [r.performedOn, r.byFamily, r.dayName, r.sets.length])).toEqual([
      ["2026-10-05", false, null, 1],
      ["2026-10-01", true, "Día A", 2],
    ]);
  });
});
