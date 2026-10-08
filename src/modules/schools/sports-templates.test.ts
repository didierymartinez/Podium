import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { ageCategories, disciplines, exercises, levelCriteria, levels, sportTests } from "@/db/schema";
import { enableDiscipline, getStructure } from "@/modules/sports/structure";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { createSchool } from "./create-school";
import { disciplineLabel, sportOf } from "./sport-template";

describe("plantillas por deporte", () => {
  it("cada modalidad sabe a qué deporte pertenece", () => {
    expect(sportOf("swim")).toBe("SWIMMING");
    expect(sportOf("speed")).toBe("SKATING");
    expect(disciplineLabel("SWIMMING", "Formativa")).toBe("Natación · Formativa");
  });
});

describe.skipIf(!testDatabaseUrl)("segundo deporte: natación (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("crea la escuela con la plantilla de natación y puede sumar una modalidad de patinaje", async () => {
    const owner = await createTestUser(conn.db, "owner");
    const created = await createSchool(conn.db, owner.id, {
      name: "Club Acuático",
      slug: `t-${crypto.randomUUID().slice(0, 8)}`,
      city: "Cali",
      discipline: "swim",
      estimatedStudents: "1-30",
    });
    if (!created.ok) throw new Error("school");
    const schoolId = created.schoolId;
    const data = await runInTenant(conn.db, { schoolId }, async (tx) => ({
      disciplines: await tx.select().from(disciplines),
      levels: await tx.select().from(levels).orderBy(levels.position),
      categories: await tx.select().from(ageCategories).orderBy(ageCategories.position),
      tests: await tx.select().from(sportTests),
      exercises: await tx.select().from(exercises),
      criteria: await tx.select().from(levelCriteria),
    }));
    expect(data.disciplines).toEqual([
      expect.objectContaining({ sport: "SWIMMING", code: "swim", name: "Formativa" }),
    ]);
    expect(data.levels.map((l) => l.name)).toEqual([
      "Adaptación",
      "Desplazamiento",
      "Estilos",
      "Perfeccionamiento",
      "Competencia",
    ]);
    expect(data.categories[0].name).toBe("Preinfantil");
    expect(data.tests.find((t) => t.name === "50 m libre")).toMatchObject({
      context: "POOL",
      lowerIsBetter: true,
    });
    expect(data.exercises.some((e) => e.name === "Patada con tabla")).toBe(true);
    expect(data.exercises.some((e) => e.name.includes("patin") || e.name.includes("Patinaje"))).toBe(false);
    expect(data.criteria.some((c) => c.name === "Flotación ventral y dorsal")).toBe(true);

    // Segundo deporte en la misma escuela.
    const ctx = { schoolId, actorUserId: owner.id };
    expect((await getStructure(conn.db, schoolId)).available.map((a) => a.code)).toContain("speed");
    expect(await enableDiscipline(conn.db, ctx, "speed")).toEqual({ ok: true });
    const [speed] = await runInTenant(conn.db, { schoolId }, (tx) =>
      tx.select().from(disciplines).where(eq(disciplines.code, "speed")),
    );
    expect(speed.sport).toBe("SKATING");
  });
});
