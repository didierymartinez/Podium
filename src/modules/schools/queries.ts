import { and, asc, eq, sql } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { ageCategories, disciplines, levels, schoolMemberships, schools } from "@/db/schema";

export async function isSlugAvailable(database: Database, slug: string): Promise<boolean> {
  const rows = await database.execute<{ available: boolean }>(
    sql`select slug_available(${slug}) as available`,
  );
  return rows[0]?.available === true;
}

/** Escuelas donde el usuario tiene membresía activa. */
export function listUserSchools(database: Database, userId: string) {
  return runInTenant(database, { userId }, (tx) =>
    tx
      .select({
        id: schools.id,
        slug: schools.slug,
        name: schools.name,
        city: schools.city,
        status: schools.status,
        roles: schoolMemberships.roles,
      })
      .from(schoolMemberships)
      .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
      .where(and(eq(schoolMemberships.userId, userId), eq(schoolMemberships.status, "ACTIVE")))
      .orderBy(asc(schools.name)),
  );
}

/** Escuela por slug, solo si el usuario es miembro activo. */
export async function getMemberSchool(database: Database, slug: string, userId: string) {
  const rows = await runInTenant(database, { userId }, (tx) =>
    tx
      .select({ school: schools, roles: schoolMemberships.roles })
      .from(schools)
      .innerJoin(
        schoolMemberships,
        and(eq(schoolMemberships.schoolId, schools.id), eq(schoolMemberships.userId, userId)),
      )
      .where(and(eq(schools.slug, slug), eq(schoolMemberships.status, "ACTIVE")))
      .limit(1),
  );
  return rows[0] ?? null;
}

/** Estructura deportiva cargada desde la plantilla (modalidades, niveles, categorías). */
export function getSportsStructure(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [disciplineRows, levelRows, categoryRows] = await Promise.all([
      tx.select().from(disciplines).orderBy(asc(disciplines.name)),
      tx.select().from(levels).orderBy(asc(levels.position)),
      tx.select().from(ageCategories).orderBy(asc(ageCategories.position)),
    ]);
    return {
      disciplines: disciplineRows.map((d) => ({
        ...d,
        levels: levelRows.filter((l) => l.disciplineId === d.id),
      })),
      ageCategories: categoryRows,
    };
  });
}
