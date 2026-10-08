import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { allVisible } from "@/db/ownership";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  athletes,
  auditLogs,
  coaches,
  disciplines,
  enrollments,
  feePlans,
  groupCoaches,
  groupSchedules,
  groups,
  levels,
  venues,
} from "@/db/schema";
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
  headCoachId: z.uuid().nullable().default(null),
  assistantCoachIds: z.array(z.uuid()).max(10).default([]),
  /** Sede (ADM-08); si falta se usa la sede principal. */
  venueId: z.uuid().nullable().default(null),
});

export type GroupInput = z.input<typeof groupSchema>;
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
  venueId: string | null;
  venueName: string | null;
  defaultFeePlanId: string | null;
  defaultFeePlanName: string | null;
  schedule: ScheduleSlot[];
  enrolled: number;
  coaches: { id: string; name: string; role: "HEAD" | "ASSISTANT" }[];
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
        venueName: venues.name,
        feePlanName: feePlans.name,
      })
      .from(groups)
      .innerJoin(disciplines, eq(disciplines.id, groups.disciplineId))
      .leftJoin(levels, eq(levels.id, groups.levelId))
      .leftJoin(venues, eq(venues.id, groups.venueId))
      .leftJoin(feePlans, eq(feePlans.id, groups.defaultFeePlanId))
      .orderBy(asc(levels.position), asc(groups.name));
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.group.id);
    const [slots, counts, coachRows] = await Promise.all([
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
      tx
        .select({
          groupId: groupCoaches.groupId,
          role: groupCoaches.role,
          id: coaches.id,
          firstName: coaches.firstName,
          lastName: coaches.lastName,
        })
        .from(groupCoaches)
        .innerJoin(coaches, eq(coaches.id, groupCoaches.coachId))
        .where(inArray(groupCoaches.groupId, ids))
        .orderBy(asc(groupCoaches.role)),
    ]);

    return rows
      .map(({ group, disciplineName, levelName, venueName, feePlanName }) => ({
        id: group.id,
        name: group.name,
        color: group.color,
        active: group.active,
        capacity: group.capacity,
        disciplineId: group.disciplineId,
        disciplineName,
        levelId: group.levelId,
        levelName,
        venueId: group.venueId,
        venueName,
        defaultFeePlanId: group.defaultFeePlanId,
        defaultFeePlanName: feePlanName,
        schedule: slots
          .filter((s) => s.groupId === group.id)
          .map((s) => ({ weekday: s.weekday, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime) })),
        enrolled: counts.find((c) => c.groupId === group.id)?.value ?? 0,
        coaches: coachRows
          .filter((c) => c.groupId === group.id)
          .map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, role: c.role })),
      }))
      .sort((a, b) => Number(b.active) - Number(a.active));
  });
}

async function replaceSchedule(tx: Tx, schoolId: string, groupId: string, schedule: ScheduleSlot[]) {
  await tx.delete(groupSchedules).where(eq(groupSchedules.groupId, groupId));
  await tx.insert(groupSchedules).values(schedule.map((slot) => ({ schoolId, groupId, ...slot })));
}

async function replaceCoaches(
  tx: Tx,
  schoolId: string,
  groupId: string,
  headId: string | null,
  assistantIds: string[],
) {
  await tx.delete(groupCoaches).where(eq(groupCoaches.groupId, groupId));
  const rows = [
    ...(headId ? [{ schoolId, groupId, coachId: headId, role: "HEAD" as const }] : []),
    ...[...new Set(assistantIds)]
      .filter((id) => id !== headId)
      .map((coachId) => ({ schoolId, groupId, coachId, role: "ASSISTANT" as const })),
  ];
  if (rows.length) await tx.insert(groupCoaches).values(rows);
}

export class InvalidReferenceError extends Error {
  constructor() {
    super("La modalidad, el nivel, la tarifa o el profesor no pertenecen a esta escuela");
  }
}

async function assertReferences(tx: Tx, input: ParsedGroup) {
  const ok =
    (await allVisible(tx, disciplines, [input.disciplineId])) &&
    (await allVisible(tx, levels, [input.levelId])) &&
    (await allVisible(tx, feePlans, [input.defaultFeePlanId])) &&
    (await allVisible(tx, venues, [input.venueId])) &&
    (await allVisible(tx, coaches, [input.headCoachId, ...input.assistantCoachIds]));
  if (!ok) throw new InvalidReferenceError();
}

type ParsedGroup = z.output<typeof groupSchema>;

/** Sede principal: la activa más antigua. */
async function defaultVenueId(tx: Tx) {
  const [venue] = await tx
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.active, true))
    .orderBy(asc(venues.createdAt))
    .limit(1);
  return venue?.id ?? null;
}

export function createGroup(database: Database, ctx: Ctx, raw: GroupInput) {
  const input = groupSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await assertReferences(tx, input);
    const { schedule, headCoachId, assistantCoachIds, ...data } = input;
    data.venueId ??= await defaultVenueId(tx);
    const [group] = await tx
      .insert(groups)
      .values({ schoolId: ctx.schoolId, ...data })
      .returning();
    await replaceSchedule(tx, ctx.schoolId, group.id, schedule);
    await replaceCoaches(tx, ctx.schoolId, group.id, headCoachId, assistantCoachIds);
    await audit(tx, ctx, "group.created", group.id, input);
    return group;
  });
}

export function updateGroup(database: Database, ctx: Ctx, groupId: string, raw: GroupInput) {
  const input = groupSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await assertReferences(tx, input);
    const { schedule, headCoachId, assistantCoachIds, ...data } = input;
    data.venueId ??= await defaultVenueId(tx);
    const [group] = await tx.update(groups).set(data).where(eq(groups.id, groupId)).returning();
    if (!group) return null;
    await replaceSchedule(tx, ctx.schoolId, group.id, schedule);
    await replaceCoaches(tx, ctx.schoolId, group.id, headCoachId, assistantCoachIds);
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

/** Alumnos con matrícula vigente por grupo (para citar a una clase extra). */
export function currentMembers(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({
        groupId: enrollments.groupId,
        athleteId: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
      })
      .from(enrollments)
      .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
      .where(inArray(enrollments.status, ["ACTIVE", "PRE_ENROLLED"]))
      .orderBy(asc(athletes.firstName), asc(athletes.lastName));
    const byGroup = new Map<string, { id: string; name: string }[]>();
    for (const r of rows) {
      const list = byGroup.get(r.groupId) ?? [];
      list.push({ id: r.athleteId, name: `${r.firstName} ${r.lastName}` });
      byGroup.set(r.groupId, list);
    }
    return byGroup;
  });
}
