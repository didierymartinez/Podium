import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  ageCategories,
  athletes,
  auditLogs,
  coaches,
  enrollments,
  groupCoaches,
  performanceTargets,
  performances,
  sportTests,
} from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { familyUserIds, notifyUsers } from "@/modules/notifications/notify";
import { findAgeCategory, sportsAge } from "@/modules/schools/age-category";
import { formatPerformance, isBetter, targetProgress } from "./format";

/** Marcas y rendimiento (DEP-50 a DEP-54). */

type Ctx = { schoolId: string; actorUserId: string; slug: string };

export const recordSchema = z.object({
  testId: z.uuid("Elige la prueba"),
  recordedOn: z.iso.date("Escribe la fecha"),
  context: z.enum(["TRAINING", "CONTROL", "COMPETITION"]),
  timing: z.enum(["MANUAL", "ELECTRONIC"]).nullable(),
  entries: z
    .array(
      z.object({
        athleteId: z.uuid(),
        value: z.number().positive().max(1_000_000),
        notes: z
          .string()
          .trim()
          .max(160)
          .nullish()
          .transform((v) => v || null),
      }),
    )
    .min(1, "Escribe al menos una marca")
    .max(200),
});

/** Grupos de un profesor (titular, auxiliar). */
export async function coachGroupIds(tx: Tx, userId: string) {
  const rows = await tx
    .select({ groupId: groupCoaches.groupId })
    .from(coaches)
    .innerJoin(groupCoaches, eq(groupCoaches.coachId, coaches.id))
    .where(and(eq(coaches.userId, userId), eq(coaches.active, true)));
  return rows.map((r) => r.groupId);
}

export type RecordResult =
  | { ok: true; saved: number; personalBests: { athleteId: string; name: string; value: string }[] }
  | { ok: false; error: "invalid_test" | "not_allowed" };

/**
 * Guarda marcas (una o en lote). Detecta mejores marcas personales por prueba y cronometraje y avisa a la
 * familia cuando se supera una anterior. Un profesor solo registra a alumnos de sus grupos.
 */
export function recordPerformances(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof recordSchema>,
  access: { isManager: boolean },
): Promise<RecordResult> {
  const input = recordSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [test] = await tx.select().from(sportTests).where(eq(sportTests.id, input.testId));
    if (!test || !test.active) return { ok: false as const, error: "invalid_test" as const };
    const ids = [...new Set(input.entries.map((e) => e.athleteId))];
    if (!access.isManager) {
      const groups = await coachGroupIds(tx, ctx.actorUserId);
      const allowed = groups.length
        ? await tx
            .selectDistinct({ athleteId: enrollments.athleteId })
            .from(enrollments)
            .where(
              and(
                inArray(enrollments.groupId, groups),
                inArray(enrollments.status, ["ACTIVE", "FROZEN"]),
                inArray(enrollments.athleteId, ids),
              ),
            )
        : [];
      if (allowed.length !== ids.length) return { ok: false as const, error: "not_allowed" as const };
    }
    const people = await tx
      .select({ id: athletes.id, firstName: athletes.firstName, lastName: athletes.lastName })
      .from(athletes)
      .where(inArray(athletes.id, ids));
    if (people.length !== ids.length) return { ok: false as const, error: "not_allowed" as const };

    const previous = await tx
      .select({ athleteId: performances.athleteId, value: performances.value, timing: performances.timing })
      .from(performances)
      .where(and(eq(performances.testId, test.id), inArray(performances.athleteId, ids)));
    const bestBefore = (athleteId: string) =>
      previous
        .filter((p) => p.athleteId === athleteId && p.timing === input.timing)
        .reduce<number | null>(
          (best, p) => (best === null || isBetter(p.value, best, test.lowerIsBetter) ? p.value : best),
          null,
        );

    await tx.insert(performances).values(
      input.entries.map((e) => ({
        schoolId: ctx.schoolId,
        athleteId: e.athleteId,
        testId: test.id,
        value: e.value,
        recordedOn: input.recordedOn,
        context: input.context,
        timing: input.timing,
        notes: e.notes,
        recordedByUserId: ctx.actorUserId,
      })),
    );

    const personalBests: { athleteId: string; name: string; value: string }[] = [];
    for (const e of input.entries) {
      const before = bestBefore(e.athleteId);
      if (before === null || !isBetter(e.value, before, test.lowerIsBetter)) continue;
      if (personalBests.some((p) => p.athleteId === e.athleteId)) continue;
      const person = people.find((p) => p.id === e.athleteId)!;
      const value = formatPerformance(test.kind, test.unit, e.value);
      personalBests.push({ athleteId: e.athleteId, name: `${person.firstName} ${person.lastName}`, value });
      await notifyUsers(tx, ctx.schoolId, await familyUserIds(tx, [e.athleteId]), {
        kind: "performance.pb",
        title: `¡Nueva mejor marca de ${person.firstName}!`,
        body: `${test.name}: ${value}`,
        href: `/${ctx.slug}/mis-hijos`,
      });
    }
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "performances.recorded",
      entity: "sport_test",
      entityId: test.id,
      data: {
        count: input.entries.length,
        recordedOn: input.recordedOn,
        personalBests: personalBests.length,
      },
    });
    return { ok: true as const, saved: input.entries.length, personalBests };
  });
}

export type TestProgress = {
  test: typeof sportTests.$inferSelect;
  marks: { id: string; value: number; recordedOn: IsoDate; context: string; timing: string | null }[];
  best: number;
  category: { name: string; average: number; best: number; athletes: number } | null;
  target: { value: number; progress: number } | null;
};

/** Ficha de rendimiento de un alumno: historial, PB, comparativo con su categoría y objetivo. */
export function athleteProgress(database: Database, schoolId: string, athleteId: string, today: IsoDate) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [athlete] = await tx.select().from(athletes).where(eq(athletes.id, athleteId));
    if (!athlete) return [];
    const mine = await tx
      .select()
      .from(performances)
      .where(eq(performances.athleteId, athleteId))
      .orderBy(asc(performances.recordedOn), asc(performances.createdAt));
    const testIds = [...new Set(mine.map((m) => m.testId))];
    if (testIds.length === 0) return [];
    const [tests, categories, targets, others] = await Promise.all([
      tx.select().from(sportTests).where(inArray(sportTests.id, testIds)),
      tx.select().from(ageCategories),
      tx.select().from(performanceTargets).where(inArray(performanceTargets.testId, testIds)),
      tx
        .select({
          athleteId: performances.athleteId,
          testId: performances.testId,
          value: performances.value,
          birthDate: athletes.birthDate,
        })
        .from(performances)
        .innerJoin(athletes, eq(athletes.id, performances.athleteId))
        .where(inArray(performances.testId, testIds)),
    ]);
    const season = Number(today.slice(0, 4));
    const categoryOf = (birthDate: string) => findAgeCategory(sportsAge(birthDate, season), categories);
    const myCategory = categoryOf(athlete.birthDate);
    return tests
      .map((test): TestProgress => {
        const marks = mine.filter((m) => m.testId === test.id);
        const pick = (values: number[]) =>
          values.reduce((b, v) => (isBetter(v, b, test.lowerIsBetter) ? v : b), values[0]);
        const best = pick(marks.map((m) => m.value));
        let category: TestProgress["category"] = null;
        if (myCategory) {
          const bestByAthlete = new Map<string, number>();
          for (const o of others.filter((o) => o.testId === test.id)) {
            if (categoryOf(o.birthDate)?.id !== myCategory.id) continue;
            const prev = bestByAthlete.get(o.athleteId);
            if (prev === undefined || isBetter(o.value, prev, test.lowerIsBetter))
              bestByAthlete.set(o.athleteId, o.value);
          }
          const bests = [...bestByAthlete.values()];
          category = {
            name: myCategory.name,
            athletes: bests.length,
            average: bests.reduce((s, v) => s + v, 0) / bests.length,
            best: pick(bests),
          };
        }
        const target = myCategory
          ? targets.find((t) => t.testId === test.id && t.ageCategoryId === myCategory.id)
          : undefined;
        return {
          test,
          marks: marks.map((m) => ({
            id: m.id,
            value: m.value,
            recordedOn: m.recordedOn,
            context: m.context,
            timing: m.timing,
          })),
          best,
          category,
          target: target
            ? { value: target.value, progress: targetProgress(best, target.value, test.lowerIsBetter) }
            : null,
        };
      })
      .sort((a, b) => a.test.position - b.test.position);
  });
}

/** Alumnos activos de un grupo para registrar marcas en lote. */
export function groupAthletes(database: Database, schoolId: string, groupId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .selectDistinct({ id: athletes.id, firstName: athletes.firstName, lastName: athletes.lastName })
      .from(enrollments)
      .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
      .where(and(eq(enrollments.groupId, groupId), eq(enrollments.status, "ACTIVE")))
      .orderBy(asc(athletes.firstName), asc(athletes.lastName)),
  );
}

export function recentPerformances(database: Database, schoolId: string, limit = 20) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        mark: performances,
        test: sportTests,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
      })
      .from(performances)
      .innerJoin(sportTests, eq(sportTests.id, performances.testId))
      .innerJoin(athletes, eq(athletes.id, performances.athleteId))
      .orderBy(desc(performances.createdAt))
      .limit(limit),
  );
}

export function listTargets(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, (tx) => tx.select().from(performanceTargets));
}

/** Marca objetivo por prueba y categoría; `null` la quita. */
export function setTarget(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  testId: string,
  ageCategoryId: string,
  value: number | null,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    if (value === null) {
      await tx
        .delete(performanceTargets)
        .where(
          and(eq(performanceTargets.testId, testId), eq(performanceTargets.ageCategoryId, ageCategoryId)),
        );
    } else {
      await tx
        .insert(performanceTargets)
        .values({ schoolId: ctx.schoolId, testId, ageCategoryId, value })
        .onConflictDoUpdate({
          target: [performanceTargets.testId, performanceTargets.ageCategoryId],
          set: { value },
        });
    }
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "performance_target.set",
      entity: "sport_test",
      entityId: testId,
      data: { ageCategoryId, value },
    });
    return true;
  });
}
