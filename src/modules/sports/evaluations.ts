import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  athleteLevels,
  athletes,
  auditLogs,
  disciplines,
  enrollments,
  evaluationScores,
  evaluations,
  groups,
  levelCriteria,
  levels,
} from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { familyUserIds, managerUserIds, notifyUsers } from "@/modules/notifications/notify";
import { coachGroupIds } from "./performances";

/** Evaluaciones técnicas y promoción de nivel (DEP-40 a DEP-44). */

type Ctx = { schoolId: string; actorUserId: string; slug: string };

/** Regla de promoción: todos los criterios ≥ 3 y promedio ≥ 3,5 (§6). */
export const PROMOTION_RULE = { minScore: 3, minAverage: 3.5 } as const;

export function promotionResult(scores: number[]) {
  const average = scores.reduce((s, v) => s + v, 0) / scores.length;
  const passed = scores.every((s) => s >= PROMOTION_RULE.minScore) && average >= PROMOTION_RULE.minAverage;
  return { average: Math.round(average * 100) / 100, passed };
}

// --- Rúbricas -------------------------------------------------------------------------------------

export function listCriteria(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx.select().from(levelCriteria).orderBy(asc(levelCriteria.levelId), asc(levelCriteria.position)),
  );
}

export function addCriterion(database: Database, ctx: Omit<Ctx, "slug">, levelId: string, name: string) {
  const text = z.string().trim().min(3).max(80).parse(name);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [level] = await tx.select({ id: levels.id }).from(levels).where(eq(levels.id, levelId));
    if (!level) return false;
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${levelCriteria.position}), 0)::int` })
      .from(levelCriteria)
      .where(eq(levelCriteria.levelId, levelId));
    await tx.insert(levelCriteria).values({ schoolId: ctx.schoolId, levelId, name: text, position: max + 1 });
    return true;
  });
}

export function removeCriterion(database: Database, ctx: Omit<Ctx, "slug">, criterionId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.delete(levelCriteria).where(eq(levelCriteria.id, criterionId));
    return true;
  });
}

// --- Nivel del alumno -----------------------------------------------------------------------------

/** Nivel vigente: el último del historial o, si no hay, el del grupo de su matrícula activa. */
export async function currentLevelId(tx: Tx, athleteId: string): Promise<string | null> {
  const [last] = await tx
    .select({ levelId: athleteLevels.levelId })
    .from(athleteLevels)
    .where(eq(athleteLevels.athleteId, athleteId))
    .orderBy(desc(athleteLevels.since), desc(athleteLevels.createdAt))
    .limit(1);
  if (last) return last.levelId;
  const [fromGroup] = await tx
    .select({ levelId: groups.levelId })
    .from(enrollments)
    .innerJoin(groups, eq(groups.id, enrollments.groupId))
    .where(and(eq(enrollments.athleteId, athleteId), eq(enrollments.status, "ACTIVE")))
    .limit(1);
  return fromGroup?.levelId ?? null;
}

async function nextLevel(tx: Tx, levelId: string) {
  const [current] = await tx.select().from(levels).where(eq(levels.id, levelId));
  if (!current) return null;
  const [next] = await tx
    .select()
    .from(levels)
    .where(
      and(
        eq(levels.disciplineId, current.disciplineId),
        eq(levels.active, true),
        gt(levels.position, current.position),
      ),
    )
    .orderBy(asc(levels.position))
    .limit(1);
  return next ?? null;
}

// --- Evaluar --------------------------------------------------------------------------------------

export const evaluationSchema = z.object({
  athleteId: z.uuid(),
  evaluatedOn: z.iso.date(),
  scores: z
    .array(z.object({ criterionId: z.uuid(), score: z.number().int().min(1).max(5) }))
    .min(1, "Califica los criterios"),
  strengths: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
  improvements: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
  comment: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
});

export type EvaluateResult =
  | { ok: true; id: string; average: number; status: "PROPOSED" | "NOT_PASSED" }
  | { ok: false; error: "no_level" | "incomplete" | "not_allowed" };

/**
 * Evalúa al alumno en su nivel vigente. Si cumple la regla queda como propuesta de promoción para la
 * administración. La familia recibe aviso del informe. Un profesor solo evalúa alumnos de sus grupos.
 */
export function evaluateAthlete(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof evaluationSchema>,
  access: { isManager: boolean },
): Promise<EvaluateResult> {
  const input = evaluationSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    if (!access.isManager) {
      const mine = await coachGroupIds(tx, ctx.actorUserId);
      const [enrolled] = mine.length
        ? await tx
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(
              and(
                eq(enrollments.athleteId, input.athleteId),
                inArray(enrollments.groupId, mine),
                eq(enrollments.status, "ACTIVE"),
              ),
            )
            .limit(1)
        : [];
      if (!enrolled) return { ok: false as const, error: "not_allowed" as const };
    }
    const levelId = await currentLevelId(tx, input.athleteId);
    if (!levelId) return { ok: false as const, error: "no_level" as const };
    const criteria = await tx.select().from(levelCriteria).where(eq(levelCriteria.levelId, levelId));
    if (
      criteria.length === 0 ||
      criteria.some((c) => !input.scores.some((s) => s.criterionId === c.id)) ||
      input.scores.some((s) => !criteria.some((c) => c.id === s.criterionId))
    )
      return { ok: false as const, error: "incomplete" as const };
    const { average, passed } = promotionResult(input.scores.map((s) => s.score));
    const status = passed ? ("PROPOSED" as const) : ("NOT_PASSED" as const);
    const [evaluation] = await tx
      .insert(evaluations)
      .values({
        schoolId: ctx.schoolId,
        athleteId: input.athleteId,
        levelId,
        evaluatedOn: input.evaluatedOn,
        average,
        status,
        strengths: input.strengths,
        improvements: input.improvements,
        comment: input.comment,
        evaluatorUserId: ctx.actorUserId,
      })
      .returning();
    await tx.insert(evaluationScores).values(
      criteria.map((c) => ({
        schoolId: ctx.schoolId,
        evaluationId: evaluation.id,
        criterionName: c.name,
        score: input.scores.find((s) => s.criterionId === c.id)!.score,
      })),
    );
    const [athlete] = await tx.select().from(athletes).where(eq(athletes.id, input.athleteId));
    await notifyUsers(tx, ctx.schoolId, await familyUserIds(tx, [input.athleteId]), {
      kind: "evaluation.report",
      title: `Nueva evaluación de ${athlete.firstName}`,
      body: "Mira sus fortalezas y en qué va a trabajar.",
      href: `/${ctx.slug}/mis-hijos`,
      dedupeKey: `evaluation:${evaluation.id}`,
    });
    if (passed) {
      await notifyUsers(tx, ctx.schoolId, await managerUserIds(tx), {
        kind: "evaluation.proposed",
        title: `Propuesta de promoción: ${athlete.firstName} ${athlete.lastName}`,
        body: `Promedio ${average.toFixed(1)}. Revísala en Evaluaciones.`,
        href: `/${ctx.slug}/evaluaciones`,
        dedupeKey: `evaluation.proposed:${evaluation.id}`,
      });
    }
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "evaluation.created",
      entity: "athlete",
      entityId: input.athleteId,
      data: { evaluationId: evaluation.id, average, status },
    });
    return { ok: true as const, id: evaluation.id, average, status };
  });
}

/** Propuestas pendientes con el nivel siguiente sugerido. */
export function pendingPromotions(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({
        evaluation: evaluations,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        levelName: levels.name,
      })
      .from(evaluations)
      .innerJoin(athletes, eq(athletes.id, evaluations.athleteId))
      .innerJoin(levels, eq(levels.id, evaluations.levelId))
      .where(eq(evaluations.status, "PROPOSED"))
      .orderBy(asc(evaluations.createdAt));
    return Promise.all(rows.map(async (r) => ({ ...r, next: await nextLevel(tx, r.evaluation.levelId) })));
  });
}

export type ReviewResult =
  | { ok: true; levelName: string; suggestedGroups: { id: string; name: string }[]; athleteId?: string }
  | { ok: false; error: "not_pending" | "last_level" };

/** Aprueba la promoción: nuevo nivel en el historial, aviso con certificado y grupos sugeridos. */
export function approvePromotion(database: Database, ctx: Ctx, evaluationId: string, today: IsoDate) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx): Promise<ReviewResult> => {
    const [evaluation] = await tx.select().from(evaluations).where(eq(evaluations.id, evaluationId));
    if (!evaluation || evaluation.status !== "PROPOSED") return { ok: false, error: "not_pending" };
    const next = await nextLevel(tx, evaluation.levelId);
    if (!next) return { ok: false, error: "last_level" };
    await tx
      .update(evaluations)
      .set({ status: "APPROVED", reviewedByUserId: ctx.actorUserId, reviewedAt: new Date() })
      .where(eq(evaluations.id, evaluationId));
    await tx.insert(athleteLevels).values({
      schoolId: ctx.schoolId,
      athleteId: evaluation.athleteId,
      levelId: next.id,
      since: today,
      evaluationId,
      createdByUserId: ctx.actorUserId,
    });
    const [athlete] = await tx.select().from(athletes).where(eq(athletes.id, evaluation.athleteId));
    await notifyUsers(tx, ctx.schoolId, await familyUserIds(tx, [evaluation.athleteId]), {
      kind: "evaluation.promoted",
      title: `¡${athlete.firstName} subió a nivel ${next.name}!`,
      body: "Descarga su certificado de nivel.",
      href: `/${ctx.slug}/mis-hijos`,
      dedupeKey: `evaluation.promoted:${evaluationId}`,
    });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "evaluation.approved",
      entity: "athlete",
      entityId: evaluation.athleteId,
      data: { evaluationId, levelId: next.id },
    });
    const suggested = await tx
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(and(eq(groups.levelId, next.id), eq(groups.active, true)));
    return { ok: true, levelName: next.name, suggestedGroups: suggested, athleteId: evaluation.athleteId };
  });
}

export function rejectPromotion(database: Database, ctx: Ctx, evaluationId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .update(evaluations)
      .set({ status: "REJECTED", reviewedByUserId: ctx.actorUserId, reviewedAt: new Date() })
      .where(and(eq(evaluations.id, evaluationId), eq(evaluations.status, "PROPOSED")))
      .returning();
    if (!row) return false;
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "evaluation.rejected",
      entity: "athlete",
      entityId: row.athleteId,
      data: { evaluationId },
    });
    return true;
  });
}

/** Nivel vigente, historial y evaluaciones del alumno (ficha y portal de familias). */
export function athleteEvaluations(database: Database, schoolId: string, athleteId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const levelId = await currentLevelId(tx, athleteId);
    const [current] = levelId
      ? await tx
          .select({ id: levels.id, name: levels.name, discipline: disciplines.name })
          .from(levels)
          .innerJoin(disciplines, eq(disciplines.id, levels.disciplineId))
          .where(eq(levels.id, levelId))
      : [];
    const [history, list] = await Promise.all([
      tx
        .select({ since: athleteLevels.since, levelName: levels.name })
        .from(athleteLevels)
        .innerJoin(levels, eq(levels.id, athleteLevels.levelId))
        .where(eq(athleteLevels.athleteId, athleteId))
        .orderBy(desc(athleteLevels.since)),
      tx
        .select({ evaluation: evaluations, levelName: levels.name })
        .from(evaluations)
        .innerJoin(levels, eq(levels.id, evaluations.levelId))
        .where(eq(evaluations.athleteId, athleteId))
        .orderBy(desc(evaluations.evaluatedOn), desc(evaluations.createdAt)),
    ]);
    const scores = list.length
      ? await tx
          .select()
          .from(evaluationScores)
          .where(
            inArray(
              evaluationScores.evaluationId,
              list.map((l) => l.evaluation.id),
            ),
          )
      : [];
    return {
      current: current ?? null,
      history,
      evaluations: list.map((l) => ({
        ...l.evaluation,
        levelName: l.levelName,
        scores: scores.filter((s) => s.evaluationId === l.evaluation.id),
      })),
    };
  });
}

/** Datos para evaluar a un alumno: su nivel vigente y la rúbrica. */
export function evaluationForm(database: Database, schoolId: string, athleteId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const levelId = await currentLevelId(tx, athleteId);
    if (!levelId) return null;
    const [[level], criteria, [athlete]] = await Promise.all([
      tx.select().from(levels).where(eq(levels.id, levelId)),
      tx
        .select()
        .from(levelCriteria)
        .where(eq(levelCriteria.levelId, levelId))
        .orderBy(asc(levelCriteria.position)),
      tx.select().from(athletes).where(eq(athletes.id, athleteId)),
    ]);
    return { level, criteria, athlete };
  });
}

/** Datos del certificado de una promoción aprobada. */
export function certificateData(database: Database, schoolId: string, evaluationId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx
      .select({
        evaluation: evaluations,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        levelId: evaluations.levelId,
        discipline: disciplines.name,
      })
      .from(evaluations)
      .innerJoin(athletes, eq(athletes.id, evaluations.athleteId))
      .innerJoin(levels, eq(levels.id, evaluations.levelId))
      .innerJoin(disciplines, eq(disciplines.id, levels.disciplineId))
      .where(eq(evaluations.id, evaluationId));
    if (!row || row.evaluation.status !== "APPROVED") return null;
    // El certificado es del nivel aprobado (el que cursaba al evaluarse).
    const [approved] = await tx.select({ name: levels.name }).from(levels).where(eq(levels.id, row.levelId));
    return {
      athleteName: `${row.firstName} ${row.lastName}`,
      levelName: approved.name,
      disciplineName: row.discipline,
      date: row.evaluation.evaluatedOn,
      average: row.evaluation.average,
    };
  });
}

/** Últimas evaluaciones de la escuela (o de los grupos de un profesor). */
export function recentEvaluations(
  database: Database,
  schoolId: string,
  athleteIds: string[] | null,
  limit = 15,
) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        id: evaluations.id,
        evaluatedOn: evaluations.evaluatedOn,
        average: evaluations.average,
        status: evaluations.status,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        levelName: levels.name,
      })
      .from(evaluations)
      .innerJoin(athletes, eq(athletes.id, evaluations.athleteId))
      .innerJoin(levels, eq(levels.id, evaluations.levelId))
      .where(
        athleteIds
          ? inArray(evaluations.athleteId, athleteIds.length ? athleteIds : [crypto.randomUUID()])
          : undefined,
      )
      .orderBy(desc(evaluations.createdAt))
      .limit(limit),
  );
}
