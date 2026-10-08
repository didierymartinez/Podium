import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import {
  activeTests,
  deleteCategory,
  enableDiscipline,
  getStructure,
  moveLevel,
  rangesOverlap,
  removeLevel,
  saveCategory,
  saveLevel,
  saveTest,
  setDisciplineActive,
  setTestActive,
} from "./structure";

describe("rangos de edad", () => {
  it("detecta cruces con extremos abiertos", () => {
    expect(rangesOverlap({ minAge: 10, maxAge: 11 }, { minAge: 12, maxAge: 13 })).toBe(false);
    expect(rangesOverlap({ minAge: 10, maxAge: 12 }, { minAge: 12, maxAge: 13 })).toBe(true);
    expect(rangesOverlap({ minAge: null, maxAge: 9 }, { minAge: 5, maxAge: 6 })).toBe(true);
    expect(rangesOverlap({ minAge: 30, maxAge: null }, { minAge: 19, maxAge: 29 })).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("estructura deportiva (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("la escuela nueva trae pruebas; se editan niveles, categorías, modalidades y pruebas", async () => {
    const f = await schoolFixture(conn.db);
    let s = await getStructure(conn.db, f.ctx.schoolId);
    const speed = s.disciplines[0];
    expect(s.tests.map((t) => t.name)).toEqual(expect.arrayContaining(["500 m sprint", "Salto horizontal"]));
    expect(speed.levels.map((l) => l.name)).toEqual([
      "Iniciación",
      "Formación",
      "Intermedio",
      "Avanzado",
      "Competencia",
    ]);

    // Niveles: crear, mover, archivar (el primero tiene un grupo) y borrar.
    expect(await saveLevel(conn.db, f.ctx, { disciplineId: speed.id, name: "Élite", goal: "" })).toEqual({
      ok: true,
    });
    s = await getStructure(conn.db, f.ctx.schoolId);
    const elite = s.disciplines[0].levels.at(-1)!;
    await moveLevel(conn.db, f.ctx, elite.id, "up");
    s = await getStructure(conn.db, f.ctx.schoolId);
    expect(s.disciplines[0].levels.map((l) => l.name).slice(-2)).toEqual(["Élite", "Competencia"]);
    expect(await removeLevel(conn.db, f.ctx, elite.id)).toEqual({ ok: true, archived: false });
    expect((await saveLevel(conn.db, f.ctx, { disciplineId: speed.id, name: "x", goal: "" })).ok).toBe(false);

    // Categorías: no se permiten cruces.
    const overlap = await saveCategory(conn.db, f.ctx, { name: "Sub-11", minAge: 10, maxAge: 12 });
    expect(overlap.ok).toBe(false);
    const mini = s.categories.find((c) => c.name === "Mini")!;
    await deleteCategory(conn.db, f.ctx, mini.id);
    expect(await saveCategory(conn.db, f.ctx, { name: "Pre-infantil", minAge: 7, maxAge: 9 })).toEqual({
      ok: true,
    });
    s = await getStructure(conn.db, f.ctx.schoolId);
    expect(s.categories[0].name).toBe("Pre-infantil");

    // Modalidades: agregar Artístico con sus niveles; la única con grupos no se desactiva.
    expect(await enableDiscipline(conn.db, f.ctx, "artistic")).toEqual({ ok: true });
    s = await getStructure(conn.db, f.ctx.schoolId);
    const artistic = s.disciplines.find((d) => d.code === "artistic")!;
    expect(artistic.levels).toHaveLength(5);
    expect((await setDisciplineActive(conn.db, f.ctx, speed.id, false)).ok).toBe(false);
    expect(await setDisciplineActive(conn.db, f.ctx, artistic.id, false)).toEqual({ ok: true });

    // Pruebas: crear una de artístico y desactivar otra.
    expect(
      await saveTest(conn.db, f.ctx, {
        disciplineId: artistic.id,
        name: "Rutina libre",
        kind: "SCORE",
        unit: "pts",
        lowerIsBetter: false,
        context: "TRACK",
      }),
    ).toEqual({ ok: true });
    const sprint = s.tests.find((t) => t.name === "500 m sprint")!;
    await setTestActive(conn.db, f.ctx, sprint.id, false);
    const forSpeed = await activeTests(conn.db, f.ctx.schoolId, [speed.id]);
    expect(forSpeed.map((t) => t.name)).not.toContain("500 m sprint");
    expect(forSpeed.map((t) => t.name)).not.toContain("Rutina libre");
    expect(forSpeed.map((t) => t.name)).toContain("Salto horizontal");
  });
});
