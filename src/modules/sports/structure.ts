import { and, asc, count, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { seedExercises } from "@/modules/training/seed";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  ageCategories,
  auditLogs,
  disciplines,
  groups,
  levelCriteria,
  levels,
  sportTests,
} from "@/db/schema";
import {
  ALL_DISCIPLINES,
  criteriaFor,
  levelsFor,
  testsFor,
  type DisciplineCode,
} from "@/modules/schools/sport-template";

/** Estructura deportiva editable de la escuela (DEP-02, docs/GESTION_DEPORTIVA.md §2). */

type Ctx = { schoolId: string; actorUserId: string };
export type StructureResult =
  { ok: true } | { ok: false; error: string; errors?: Record<string, string[] | undefined> };

const fail = (error: string): StructureResult => ({ ok: false, error });
const fieldErrors = (e: z.ZodError): StructureResult => ({
  ok: false,
  error: "Revisa los campos marcados",
  errors: z.flattenError(e).fieldErrors,
});

async function audit(tx: Tx, ctx: Ctx, action: string, entityId: string, data: object = {}) {
  await tx.insert(auditLogs).values({
    schoolId: ctx.schoolId,
    actorUserId: ctx.actorUserId,
    action,
    entity: "sport_structure",
    entityId,
    data,
  });
}

export { TEST_CONTEXT_LABELS, TEST_KIND_LABELS } from "./labels";

export function getStructure(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [disciplineRows, levelRows, categoryRows, testRows, groupCounts] = await Promise.all([
      tx.select().from(disciplines).orderBy(asc(disciplines.name)),
      tx.select().from(levels).orderBy(asc(levels.position)),
      tx.select().from(ageCategories).orderBy(asc(ageCategories.position)),
      tx.select().from(sportTests).orderBy(asc(sportTests.context), asc(sportTests.position)),
      tx
        .select({ levelId: groups.levelId, disciplineId: groups.disciplineId, n: count() })
        .from(groups)
        .where(eq(groups.active, true))
        .groupBy(groups.levelId, groups.disciplineId),
    ]);
    const groupsOfLevel = (id: string) =>
      groupCounts.filter((g) => g.levelId === id).reduce((s, g) => s + g.n, 0);
    const groupsOfDiscipline = (id: string) =>
      groupCounts.filter((g) => g.disciplineId === id).reduce((s, g) => s + g.n, 0);
    return {
      disciplines: disciplineRows.map((d) => ({
        ...d,
        groups: groupsOfDiscipline(d.id),
        levels: levelRows
          .filter((l) => l.disciplineId === d.id)
          .map((l) => ({ ...l, groups: groupsOfLevel(l.id) })),
      })),
      available: ALL_DISCIPLINES.filter((t) => !disciplineRows.some((d) => d.code === t.code)),
      categories: categoryRows,
      tests: testRows,
    };
  });
}

/** Agrega una modalidad de la plantilla (con sus niveles y pruebas) o la reactiva. */
export function enableDiscipline(database: Database, ctx: Ctx, code: string): Promise<StructureResult> {
  const template = ALL_DISCIPLINES.find((d) => d.code === code);
  if (!template) return Promise.resolve(fail("Modalidad desconocida"));
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [existing] = await tx.select().from(disciplines).where(eq(disciplines.code, code));
    if (existing) {
      await tx.update(disciplines).set({ active: true }).where(eq(disciplines.id, existing.id));
      await audit(tx, ctx, "discipline.enabled", existing.id);
      return { ok: true as const };
    }
    const [created] = await tx
      .insert(disciplines)
      .values({ schoolId: ctx.schoolId, sport: template.sport, code: template.code, name: template.name })
      .returning();
    const createdLevels = await tx
      .insert(levels)
      .values(
        levelsFor(template.code as DisciplineCode).map((l, i) => ({
          schoolId: ctx.schoolId,
          disciplineId: created.id,
          name: l.name,
          goal: l.goal,
          position: i + 1,
        })),
      )
      .returning({ id: levels.id, name: levels.name });
    await tx.insert(levelCriteria).values(
      createdLevels.flatMap((l) =>
        criteriaFor(template.code as DisciplineCode, l.name).map((name, i) => ({
          schoolId: ctx.schoolId,
          levelId: l.id,
          name,
          position: i + 1,
        })),
      ),
    );
    await seedExercises(tx, ctx.schoolId, { id: created.id, code: template.code }, createdLevels, {
      common: false,
    });
    const specific = testsFor(template.code as DisciplineCode).filter((t) => !t.common);
    if (specific.length) {
      await tx.insert(sportTests).values(
        specific.map((t, i) => ({
          schoolId: ctx.schoolId,
          disciplineId: created.id,
          name: t.name,
          kind: t.kind,
          unit: t.unit,
          lowerIsBetter: t.lowerIsBetter,
          context: t.context,
          position: i + 1,
        })),
      );
    }
    await audit(tx, ctx, "discipline.added", created.id, { code });
    return { ok: true as const };
  });
}

export function setDisciplineActive(
  database: Database,
  ctx: Ctx,
  id: string,
  active: boolean,
): Promise<StructureResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    if (!active) {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(groups)
        .where(and(eq(groups.disciplineId, id), eq(groups.active, true)));
      if (n > 0) return fail("Tiene grupos activos: archívalos primero.");
      const [{ others }] = await tx
        .select({ others: count() })
        .from(disciplines)
        .where(and(ne(disciplines.id, id), eq(disciplines.active, true)));
      if (others === 0) return fail("La escuela necesita al menos una modalidad activa.");
    }
    await tx.update(disciplines).set({ active }).where(eq(disciplines.id, id));
    await audit(tx, ctx, active ? "discipline.enabled" : "discipline.disabled", id);
    return { ok: true as const };
  });
}

export const levelSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(40),
  goal: z
    .string()
    .trim()
    .max(160)
    .transform((v) => v || null),
});

export function saveLevel(
  database: Database,
  ctx: Ctx,
  raw: { disciplineId: string; name: string; goal: string },
  id?: string,
): Promise<StructureResult> {
  const parsed = levelSchema.safeParse(raw);
  if (!parsed.success) return Promise.resolve(fieldErrors(parsed.error));
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    if (id) {
      const [row] = await tx
        .update(levels)
        .set(parsed.data)
        .where(eq(levels.id, id))
        .returning({ id: levels.id });
      if (!row) return fail("No encontramos el nivel");
      await audit(tx, ctx, "level.updated", id, parsed.data);
    } else {
      const [discipline] = await tx.select().from(disciplines).where(eq(disciplines.id, raw.disciplineId));
      if (!discipline) return fail("Modalidad inválida");
      const [{ max }] = await tx
        .select({ max: sql<number>`coalesce(max(${levels.position}), 0)::int` })
        .from(levels)
        .where(eq(levels.disciplineId, discipline.id));
      const [created] = await tx
        .insert(levels)
        .values({ schoolId: ctx.schoolId, disciplineId: discipline.id, ...parsed.data, position: max + 1 })
        .returning();
      await audit(tx, ctx, "level.created", created.id, parsed.data);
    }
    return { ok: true as const };
  });
}

/** Sube o baja un nivel intercambiando su orden con el vecino de la misma modalidad. */
export function moveLevel(
  database: Database,
  ctx: Ctx,
  id: string,
  direction: "up" | "down",
): Promise<StructureResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [level] = await tx.select().from(levels).where(eq(levels.id, id));
    if (!level) return fail("No encontramos el nivel");
    const [neighbor] = await tx
      .select()
      .from(levels)
      .where(
        and(
          eq(levels.disciplineId, level.disciplineId),
          direction === "up" ? lt(levels.position, level.position) : gt(levels.position, level.position),
        ),
      )
      .orderBy(direction === "up" ? sql`${levels.position} desc` : asc(levels.position))
      .limit(1);
    if (!neighbor) return { ok: true as const };
    await tx.update(levels).set({ position: neighbor.position }).where(eq(levels.id, level.id));
    await tx.update(levels).set({ position: level.position }).where(eq(levels.id, neighbor.id));
    await audit(tx, ctx, "level.moved", id, { direction });
    return { ok: true as const };
  });
}

/** Sin grupos se elimina; con grupos solo se puede desactivar (los grupos conservan su nivel). */
export function removeLevel(
  database: Database,
  ctx: Ctx,
  id: string,
): Promise<StructureResult & { archived?: boolean }> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(groups).where(eq(groups.levelId, id));
    if (n > 0) {
      await tx.update(levels).set({ active: false }).where(eq(levels.id, id));
      await audit(tx, ctx, "level.archived", id);
      return { ok: true as const, archived: true };
    }
    await tx.delete(levels).where(eq(levels.id, id));
    await audit(tx, ctx, "level.deleted", id);
    return { ok: true as const, archived: false };
  });
}

export function restoreLevel(database: Database, ctx: Ctx, id: string): Promise<StructureResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.update(levels).set({ active: true }).where(eq(levels.id, id));
    await audit(tx, ctx, "level.restored", id);
    return { ok: true as const };
  });
}

const age = z.number().int().min(0).max(99).nullable();
export const categorySchema = z
  .object({ name: z.string().trim().min(2, "Escribe el nombre").max(40), minAge: age, maxAge: age })
  .refine((c) => c.minAge !== null || c.maxAge !== null, {
    path: ["maxAge"],
    message: "Define al menos una edad",
  })
  .refine((c) => c.minAge === null || c.maxAge === null || c.minAge <= c.maxAge, {
    path: ["maxAge"],
    message: "La edad máxima debe ser mayor o igual a la mínima",
  });

const lo = (c: { minAge: number | null }) => c.minAge ?? 0;
const hi = (c: { maxAge: number | null }) => c.maxAge ?? 999;
/** Dos rangos de edad se cruzan si comparten al menos una edad. */
export const rangesOverlap = (
  a: { minAge: number | null; maxAge: number | null },
  b: { minAge: number | null; maxAge: number | null },
) => lo(a) <= hi(b) && lo(b) <= hi(a);

export function saveCategory(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof categorySchema>,
  id?: string,
): Promise<StructureResult> {
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return Promise.resolve(fieldErrors(parsed.error));
  const input = parsed.data;
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const others = (await tx.select().from(ageCategories)).filter((c) => c.id !== id);
    const clash = others.find((c) => rangesOverlap(c, input));
    if (clash)
      return {
        ok: false as const,
        error: `Se cruza con la categoría ${clash.name}`,
        errors: { minAge: [`Se cruza con ${clash.name}`] },
      };
    if (id) {
      await tx.update(ageCategories).set(input).where(eq(ageCategories.id, id));
      await audit(tx, ctx, "age_category.updated", id, input);
    } else {
      const [created] = await tx
        .insert(ageCategories)
        .values({ schoolId: ctx.schoolId, ...input, position: others.length + 1 })
        .returning();
      await audit(tx, ctx, "age_category.created", created.id, input);
    }
    // El orden sigue la edad para que la lista se lea de menor a mayor.
    const all = await tx.select().from(ageCategories);
    const sorted = [...all].sort((a, b) => lo(a) - lo(b));
    for (const [i, c] of sorted.entries())
      if (c.position !== i + 1)
        await tx
          .update(ageCategories)
          .set({ position: i + 1 })
          .where(eq(ageCategories.id, c.id));
    return { ok: true as const };
  });
}

export function deleteCategory(database: Database, ctx: Ctx, id: string): Promise<StructureResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.delete(ageCategories).where(eq(ageCategories.id, id));
    await audit(tx, ctx, "age_category.deleted", id);
    return { ok: true as const };
  });
}

export const testSchema = z.object({
  disciplineId: z.uuid().nullable(),
  name: z.string().trim().min(2, "Escribe el nombre").max(60),
  kind: z.enum(["TIME", "DISTANCE", "POINTS", "REPS", "SCORE", "POSITION"]),
  unit: z.string().trim().min(1, "Escribe la unidad").max(12),
  lowerIsBetter: z.boolean(),
  context: z.enum(["TRACK", "ROAD", "FIELD", "POOL"]),
});

export function saveTest(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof testSchema>,
  id?: string,
): Promise<StructureResult> {
  const parsed = testSchema.safeParse(raw);
  if (!parsed.success) return Promise.resolve(fieldErrors(parsed.error));
  const input = parsed.data;
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    if (input.disciplineId) {
      const [d] = await tx
        .select({ id: disciplines.id })
        .from(disciplines)
        .where(eq(disciplines.id, input.disciplineId));
      if (!d) return fail("Modalidad inválida");
    }
    if (id) {
      await tx.update(sportTests).set(input).where(eq(sportTests.id, id));
      await audit(tx, ctx, "sport_test.updated", id, input);
    } else {
      const [{ max }] = await tx
        .select({ max: sql<number>`coalesce(max(${sportTests.position}), 0)::int` })
        .from(sportTests);
      const [created] = await tx
        .insert(sportTests)
        .values({ schoolId: ctx.schoolId, ...input, position: max + 1 })
        .returning();
      await audit(tx, ctx, "sport_test.created", created.id, input);
    }
    return { ok: true as const };
  });
}

export function setTestActive(
  database: Database,
  ctx: Ctx,
  id: string,
  active: boolean,
): Promise<StructureResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.update(sportTests).set({ active }).where(eq(sportTests.id, id));
    await audit(tx, ctx, active ? "sport_test.enabled" : "sport_test.disabled", id);
    return { ok: true as const };
  });
}

/** Pruebas activas de las modalidades indicadas (más las comunes), para registrar marcas. */
export function activeTests(database: Database, schoolId: string, disciplineIds?: string[]) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(sportTests)
      .where(
        and(
          eq(sportTests.active, true),
          disciplineIds
            ? sql`(${sportTests.disciplineId} is null or ${inArray(sportTests.disciplineId, disciplineIds.length ? disciplineIds : ["00000000-0000-0000-0000-000000000000"])})`
            : undefined,
        ),
      )
      .orderBy(asc(sportTests.context), asc(sportTests.position)),
  );
}
