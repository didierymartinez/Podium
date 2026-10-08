import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { allVisible } from "@/db/ownership";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { auditLogs, disciplines, enrollments, feePlans, groupSchedules, groups, levels } from "@/db/schema";
import { CURRENT_STATUSES } from "@/modules/athletes/enrollment-status";
import { hhmm, scheduleSchema, type ScheduleSlot } from "./schedule";

export const groupSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del grupo").max(60),
  disciplineId: z.uuid("Elige la modalidad"),
  levelId: z.uuid().nullable(),
  capacity: z.number("Escribe el cupo").int().min(1, "El cupo mínimo es 1").max(500),
  defaultFeePlanId: z.uuid().nullable(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  schedule: scheduleSchema,
});

export type GroupInput = z.infer<typeof groupSchema>;
type Ctx = { schoolId: string; actorUserId: string };

export type GroupSummary = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  capacity: number;
  disciplineId: string;
  disciplineName: string;
  levelId: string | null;
  levelName: string | null;
  defaultFeePlanId: string | null;
  defaultFeePlanName: string | null;
  schedule: ScheduleSlot[];
  enrolled: number;
};

/** Grupos con horario, nivel y ocupación (matrículas vigentes). */
export function listGroups(database: Database, schoolId: string): Promise<GroupSummary[]> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({
        group: groups,
        disciplineName: disciplines.name,
        levelName: levels.name,
        levelPosition: levels.position,
        feePlanName: feePlans.name,
      })
      .from(groups)
      .innerJoin(disciplines, eq(disciplines.id, groups.disciplineId))
      .leftJoin(levels, eq(levels.id, groups.levelId))
      .leftJoin(feePlans, eq(feePlans.id, groups.defaultFeePlanId))
      .orderBy(asc(levels.position), asc(groups.name));
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.group.id);
    const [slots, counts] = await Promise.all([
      tx
        .select()
        .from(groupSchedules)
        .where(inArray(groupSchedules.groupId, ids))
        .orderBy(asc(groupSchedules.weekday), asc(groupSchedules.startTime)),
      tx
        .select({ groupId: enrollments.groupId, value: count() })
        .from(enrollments)
        .where(and(inArray(enrollments.groupId, ids), inArray(enrollments.status, CURRENT_STATUSES)))
        .groupBy(enrollments.groupId),
    ]);

    return rows
      .map(({ group, disciplineName, levelName, feePlanName }) => ({
        id: group.id,
        name: group.name,
        color: group.color,
        active: group.active,
        capacity: group.capacity,
        disciplineId: group.disciplineId,
        disciplineName,
        levelId: group.levelId,
        levelName,
        defaultFeePlanId: group.defaultFeePlanId,
        defaultFeePlanName: feePlanName,
        schedule: slots
          .filter((s) => s.groupId === group.id)
          .map((s) => ({ weekday: s.weekday, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime) })),
        enrolled: counts.find((c) => c.groupId === group.id)?.value ?? 0,
      }))
      .sort((a, b) => Number(b.active) - Number(a.active));
  });
}

async function replaceSchedule(tx: Tx, schoolId: string, groupId: string, schedule: ScheduleSlot[]) {
  await tx.delete(groupSchedules).where(eq(groupSchedules.groupId, groupId));
  await tx.insert(groupSchedules).values(schedule.map((slot) => ({ schoolId, groupId, ...slot })));
}

export class InvalidReferenceError extends Error {
  constructor() {
    super("La modalidad, el nivel o la tarifa no pertenecen a esta escuela");
  }
}

async function assertReferences(tx: Tx, input: GroupInput) {
  const ok =
    (await allVisible(tx, disciplines, [input.disciplineId])) &&
    (await allVisible(tx, levels, [input.levelId])) &&
    (await allVisible(tx, feePlans, [input.defaultFeePlanId]));
  if (!ok) throw new InvalidReferenceError();
}

export function createGroup(database: Database, ctx: Ctx, input: GroupInput) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await assertReferences(tx, input);
    const { schedule, ...data } = input;
    const [group] = await tx
      .insert(groups)
      .values({ schoolId: ctx.schoolId, ...data })
      .returning();
    await replaceSchedule(tx, ctx.schoolId, group.id, schedule);
    await audit(tx, ctx, "group.created", group.id, input);
    return group;
  });
}

export function updateGroup(database: Database, ctx: Ctx, groupId: string, input: GroupInput) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await assertReferences(tx, input);
    const { schedule, ...data } = input;
    const [group] = await tx.update(groups).set(data).where(eq(groups.id, groupId)).returning();
    if (!group) return null;
    await replaceSchedule(tx, ctx.schoolId, group.id, schedule);
    await audit(tx, ctx, "group.updated", group.id, input);
    return group;
  });
}

export function setGroupActive(database: Database, ctx: Ctx, groupId: string, active: boolean) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [group] = await tx.update(groups).set({ active }).where(eq(groups.id, groupId)).returning();
    if (group) await audit(tx, ctx, active ? "group.activated" : "group.archived", group.id, {});
    return group ?? null;
  });
}

async function audit(tx: Tx, ctx: Ctx, action: string, entityId: string, data: object) {
  await tx.insert(auditLogs).values({
    schoolId: ctx.schoolId,
    actorUserId: ctx.actorUserId,
    action,
    entity: "group",
    entityId,
    data,
  });
}
