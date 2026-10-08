import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  auditLogs,
  exercises,
  groups,
  planAssignments,
  sessionPlanItems,
  sessionPlans,
  sessionReports,
  sessions,
} from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { isSessionCoach } from "@/modules/attendance/attendance";
import { coachGroupIds } from "@/modules/sports/performances";
import { EXERCISE_COMPONENTS } from "./exercise-template";

/** Planificación de entrenamientos (DEP-30 a DEP-35). */

type Ctx = { schoolId: string; actorUserId: string };
type Access = { isManager: boolean };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v ?? "");

// --- Biblioteca -----------------------------------------------------------------------------------

export const exerciseSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre").max(80),
  component: z.enum(EXERCISE_COMPONENTS),
  disciplineId: z.uuid().nullable(),
  levelIds: z.array(z.uuid()).max(20),
  description: optionalText(1500),
  mediaUrl: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\//.test(v), "El enlace debe empezar por https://"),
  minutes: z.number().int().min(1).max(180),
  materials: optionalText(200),
  space: optionalText(80),
  shared: z.boolean(),
});

export type ExerciseFilters = { q?: string; component?: string; levelId?: string; disciplineId?: string };

/** Ejercicios activos visibles para la persona: los compartidos y los suyos. */
export function listExercises(database: Database, schoolId: string, userId: string, f: ExerciseFilters = {}) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(exercises)
      .where(
        and(
          eq(exercises.active, true),
          or(eq(exercises.shared, true), eq(exercises.ownerUserId, userId)),
          f.q ? ilike(exercises.name, `%${f.q.replace(/[%_\\]/g, "")}%`) : undefined,
          f.component && (EXERCISE_COMPONENTS as readonly string[]).includes(f.component)
            ? eq(exercises.component, f.component as (typeof EXERCISE_COMPONENTS)[number])
            : undefined,
          f.disciplineId && /^[0-9a-f-]{36}$/i.test(f.disciplineId)
            ? or(eq(exercises.disciplineId, f.disciplineId), sql`${exercises.disciplineId} is null`)
            : undefined,
          f.levelId && /^[0-9a-f-]{36}$/i.test(f.levelId)
            ? sql`(cardinality(${exercises.levelIds}) = 0 or ${f.levelId}::uuid = any(${exercises.levelIds}))`
            : undefined,
        ),
      )
      .orderBy(asc(exercises.component), asc(exercises.name)),
  );
}

export function createExercise(database: Database, ctx: Ctx, raw: z.input<typeof exerciseSchema>) {
  const input = exerciseSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .insert(exercises)
      .values({ schoolId: ctx.schoolId, ...input, ownerUserId: ctx.actorUserId })
      .returning({ id: exercises.id });
    return row.id;
  });
}

/** Archiva un ejercicio: quien lo creó o la administración. */
export function archiveExercise(database: Database, ctx: Ctx, exerciseId: string, access: Access) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const updated = await tx
      .update(exercises)
      .set({ active: false })
      .where(
        and(
          eq(exercises.id, exerciseId),
          access.isManager ? undefined : eq(exercises.ownerUserId, ctx.actorUserId),
        ),
      )
      .returning({ id: exercises.id });
    return updated.length > 0;
  });
}

// --- Planes ---------------------------------------------------------------------------------------

export const PLAN_PHASES = ["WARMUP", "MAIN", "COOLDOWN"] as const;

export const planSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre del plan").max(80),
  objective: optionalText(300),
  isTemplate: z.boolean(),
  items: z
    .array(
      z.object({
        exerciseId: z.uuid().nullable(),
        title: z.string().trim().min(2).max(80),
        phase: z.enum(PLAN_PHASES),
        minutes: z.number().int().min(1).max(180),
        notes: z
          .string()
          .trim()
          .max(300)
          .nullish()
          .transform((v) => v || null),
      }),
    )
    .min(1, "Agrega al menos un ejercicio")
    .max(40),
});

async function writeItems(
  tx: Tx,
  schoolId: string,
  planId: string,
  items: z.output<typeof planSchema>["items"],
) {
  // Orden: calentamiento → parte principal → vuelta a la calma, respetando el orden dentro de cada fase.
  const sorted = PLAN_PHASES.flatMap((phase) => items.filter((i) => i.phase === phase));
  await tx
    .insert(sessionPlanItems)
    .values(sorted.map((i, position) => ({ schoolId, planId, ...i, position: position + 1 })));
}

export function createPlan(database: Database, ctx: Ctx, raw: z.input<typeof planSchema>) {
  const input = planSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [plan] = await tx
      .insert(sessionPlans)
      .values({
        schoolId: ctx.schoolId,
        name: input.name,
        objective: input.objective,
        isTemplate: input.isTemplate,
        ownerUserId: ctx.actorUserId,
      })
      .returning({ id: sessionPlans.id });
    await writeItems(tx, ctx.schoolId, plan.id, input.items);
    return plan.id;
  });
}

export function updatePlan(database: Database, ctx: Ctx, planId: string, raw: z.input<typeof planSchema>) {
  const input = planSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const updated = await tx
      .update(sessionPlans)
      .set({ name: input.name, objective: input.objective, isTemplate: input.isTemplate })
      .where(eq(sessionPlans.id, planId))
      .returning({ id: sessionPlans.id });
    if (updated.length === 0) return false;
    await tx.delete(sessionPlanItems).where(eq(sessionPlanItems.planId, planId));
    await writeItems(tx, ctx.schoolId, planId, input.items);
    return true;
  });
}

/** Duplica un plan o plantilla (DEP-32); la copia es un plan normal editable. */
export function duplicatePlan(database: Database, ctx: Ctx, planId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [plan] = await tx.select().from(sessionPlans).where(eq(sessionPlans.id, planId));
    if (!plan) return null;
    const items = await tx
      .select()
      .from(sessionPlanItems)
      .where(eq(sessionPlanItems.planId, planId))
      .orderBy(asc(sessionPlanItems.position));
    const [copy] = await tx
      .insert(sessionPlans)
      .values({
        schoolId: ctx.schoolId,
        name: `${plan.name} (copia)`.slice(0, 80),
        objective: plan.objective,
        isTemplate: false,
        ownerUserId: ctx.actorUserId,
      })
      .returning({ id: sessionPlans.id });
    if (items.length)
      await tx.insert(sessionPlanItems).values(
        items.map((i) => ({
          schoolId: ctx.schoolId,
          planId: copy.id,
          exerciseId: i.exerciseId,
          title: i.title,
          phase: i.phase,
          position: i.position,
          minutes: i.minutes,
          notes: i.notes,
        })),
      );
    return copy.id;
  });
}

export function deletePlan(database: Database, ctx: Ctx, planId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const deleted = await tx.delete(sessionPlans).where(eq(sessionPlans.id, planId)).returning();
    return deleted.length > 0;
  });
}

/** Planes con duración total y próximas asignaciones. */
export function listPlans(database: Database, schoolId: string, today: IsoDate) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const plans = await tx
      .select()
      .from(sessionPlans)
      .orderBy(desc(sessionPlans.isTemplate), desc(sessionPlans.updatedAt));
    if (plans.length === 0) return [];
    const ids = plans.map((p) => p.id);
    const [items, upcoming] = await Promise.all([
      tx
        .select()
        .from(sessionPlanItems)
        .where(inArray(sessionPlanItems.planId, ids))
        .orderBy(asc(sessionPlanItems.position)),
      tx
        .select({
          id: planAssignments.id,
          planId: planAssignments.planId,
          date: planAssignments.date,
          groupName: groups.name,
        })
        .from(planAssignments)
        .innerJoin(groups, eq(groups.id, planAssignments.groupId))
        .where(and(inArray(planAssignments.planId, ids), gte(planAssignments.date, today)))
        .orderBy(asc(planAssignments.date)),
    ]);
    return plans.map((p) => {
      const own = items.filter((i) => i.planId === p.id);
      return {
        ...p,
        items: own,
        minutes: own.reduce((s, i) => s + i.minutes, 0),
        upcoming: upcoming.filter((a) => a.planId === p.id),
      };
    });
  });
}

// --- Asignación y sesión --------------------------------------------------------------------------

export type AssignResult =
  { ok: true; assigned: number } | { ok: false; error: "not_found" | "not_allowed" | "past" };

/** Asigna el plan a uno o varios días futuros de un grupo (DEP-31); reemplaza el plan que hubiera. */
export function assignPlan(
  database: Database,
  ctx: Ctx,
  input: { planId: string; groupId: string; dates: IsoDate[] },
  today: IsoDate,
  access: Access,
): Promise<AssignResult> {
  const dates = [...new Set(z.array(z.iso.date()).min(1).max(60).parse(input.dates))];
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    if (dates.some((d) => d < today)) return { ok: false, error: "past" };
    const [plan] = await tx
      .select({ id: sessionPlans.id })
      .from(sessionPlans)
      .where(eq(sessionPlans.id, input.planId));
    const [group] = await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, input.groupId));
    if (!plan || !group) return { ok: false, error: "not_found" };
    if (!access.isManager && !(await coachGroupIds(tx, ctx.actorUserId)).includes(group.id))
      return { ok: false, error: "not_allowed" };
    await tx
      .insert(planAssignments)
      .values(
        dates.map((date) => ({
          schoolId: ctx.schoolId,
          planId: plan.id,
          groupId: group.id,
          date,
          createdByUserId: ctx.actorUserId,
        })),
      )
      .onConflictDoUpdate({
        target: [planAssignments.groupId, planAssignments.date],
        set: { planId: plan.id, createdByUserId: ctx.actorUserId },
      });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "session_plan.assigned",
      entity: "group",
      entityId: group.id,
      data: { planId: plan.id, dates },
    });
    return { ok: true, assigned: dates.length };
  });
}

export function unassignPlan(database: Database, ctx: Ctx, assignmentId: string, access: Access) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx.select().from(planAssignments).where(eq(planAssignments.id, assignmentId));
    if (!row) return false;
    if (!access.isManager && !(await coachGroupIds(tx, ctx.actorUserId)).includes(row.groupId)) return false;
    await tx.delete(planAssignments).where(eq(planAssignments.id, assignmentId));
    return true;
  });
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Plan del día de la sesión (DEP-34) y su registro post-sesión (DEP-35). */
export function sessionPlan(database: Database, schoolId: string, sessionId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return null;
    const [[assignment], [report]] = await Promise.all([
      tx
        .select({ plan: sessionPlans })
        .from(planAssignments)
        .innerJoin(sessionPlans, eq(sessionPlans.id, planAssignments.planId))
        .where(and(eq(planAssignments.groupId, session.groupId), eq(planAssignments.date, session.date))),
      tx.select().from(sessionReports).where(eq(sessionReports.sessionId, sessionId)),
    ]);
    const items = assignment
      ? await tx
          .select()
          .from(sessionPlanItems)
          .where(eq(sessionPlanItems.planId, assignment.plan.id))
          .orderBy(asc(sessionPlanItems.position))
      : [];
    return {
      plan: assignment?.plan ?? null,
      items,
      report: report ?? null,
      duration: minutesOf(session.endTime) - minutesOf(session.startTime),
    };
  });
}

export const reportSchema = z.object({
  fulfilled: z.enum(["YES", "PARTIAL", "NO"]),
  rpe: z.number().int().min(0).max(10),
  minutes: z.number().int().min(1).max(600),
  notes: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => v || null),
});

/** Registro post-sesión (DEP-35): profesor de la clase o administración; se puede corregir. */
export function saveSessionReport(
  database: Database,
  ctx: Ctx,
  sessionId: string,
  raw: z.input<typeof reportSchema>,
  access: Access,
) {
  const input = reportSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session || session.status === "CANCELED") return false;
    if (!access.isManager && !(await isSessionCoach(tx, session, ctx.actorUserId))) return false;
    const [assignment] = await tx
      .select({ planId: planAssignments.planId })
      .from(planAssignments)
      .where(and(eq(planAssignments.groupId, session.groupId), eq(planAssignments.date, session.date)));
    const values = { ...input, planId: assignment?.planId ?? null, recordedByUserId: ctx.actorUserId };
    await tx
      .insert(sessionReports)
      .values({ schoolId: ctx.schoolId, sessionId, ...values })
      .onConflictDoUpdate({ target: sessionReports.sessionId, set: values });
    return true;
  });
}

export function getPlan(database: Database, schoolId: string, planId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [plan] = await tx.select().from(sessionPlans).where(eq(sessionPlans.id, planId));
    if (!plan) return null;
    const items = await tx
      .select()
      .from(sessionPlanItems)
      .where(eq(sessionPlanItems.planId, planId))
      .orderBy(asc(sessionPlanItems.position));
    return { ...plan, items };
  });
}
