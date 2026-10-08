import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { ageCategories, levels, schools, venues } from "@/db/schema";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { createSchool, type CreateSchoolInput } from "./create-school";
import { getMemberSchool, isSlugAvailable, listUserSchools } from "./queries";

const suffix = () => crypto.randomUUID().slice(0, 8);
const input = (slug: string): CreateSchoolInput => ({
  name: "Club Patín Veloz",
  slug,
  city: "Medellín",
  discipline: "speed",
  estimatedStudents: "31-80",
});

describe.skipIf(!testDatabaseUrl)("createSchool + RLS (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;

  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("crea la escuela en prueba con la plantilla de patinaje", async () => {
    const owner = await createTestUser(conn.db, "owner");
    const slug = `veloz-${suffix()}`;
    const result = await createSchool(conn.db, owner.id, input(slug), new Date("2026-10-08T12:00:00Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const member = await getMemberSchool(conn.db, slug, owner.id);
    expect(member?.roles).toEqual(["OWNER"]);
    expect(member?.school.status).toBe("TRIAL");
    expect(member?.school.trialEndsAt?.toISOString()).toBe("2026-11-07T12:00:00.000Z");

    const counts = await runInTenant(conn.db, { schoolId: result.schoolId }, async (tx) => ({
      levels: (await tx.select().from(levels)).length,
      categories: (await tx.select().from(ageCategories)).length,
      venues: (await tx.select().from(venues)).length,
    }));
    expect(counts).toEqual({ levels: 5, categories: 7, venues: 1 });
    expect(await isSlugAvailable(conn.db, slug)).toBe(false);
  });

  it("rechaza un slug repetido", async () => {
    const a = await createTestUser(conn.db, "a");
    const b = await createTestUser(conn.db, "b");
    const slug = `dup-${suffix()}`;
    expect((await createSchool(conn.db, a.id, input(slug))).ok).toBe(true);
    expect(await createSchool(conn.db, b.id, input(slug))).toEqual({ ok: false, error: "slug_taken" });
  });

  it("aísla los datos entre escuelas", async () => {
    const a = await createTestUser(conn.db, "a");
    const b = await createTestUser(conn.db, "b");
    const schoolA = await createSchool(conn.db, a.id, input(`a-${suffix()}`));
    const schoolB = await createSchool(conn.db, b.id, input(`b-${suffix()}`));
    if (!schoolA.ok || !schoolB.ok) throw new Error("setup");

    // B no ve la escuela de A ni sus datos.
    expect((await listUserSchools(conn.db, b.id)).map((s) => s.id)).toEqual([schoolB.schoolId]);
    expect(await getMemberSchool(conn.db, schoolA.slug, b.id)).toBeNull();
    const leaked = await runInTenant(conn.db, { schoolId: schoolB.schoolId }, (tx) =>
      tx.select().from(levels).where(eq(levels.schoolId, schoolA.schoolId)),
    );
    expect(leaked).toHaveLength(0);

    // Sin contexto no se ve nada.
    const noContext = await runInTenant(conn.db, {}, (tx) => tx.select().from(schools));
    expect(noContext).toHaveLength(0);

    // No se puede escribir en otra escuela.
    await expect(
      runInTenant(conn.db, { schoolId: schoolB.schoolId }, (tx) =>
        tx.insert(venues).values({ schoolId: schoolA.schoolId, name: "intrusa" }),
      ),
    ).rejects.toThrow();
  });
});
