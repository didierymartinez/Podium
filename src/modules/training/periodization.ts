import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import {
  athletes,
  attendance,
  auditLogs,
  coaches,
  competitions,
  groupCoaches,
  groups,
  sessionReports,
  sessions,
  trainingPeriods,
} from "@/db/schema";
import { addDays, startOfWeek, type IsoDate } from "@/lib/dates";
import { notifyUsers } from "@/modules/notifications/notify";
import { coachGroupIds } from "@/modules/sports/performances";

/** Periodización (DEP-33) y carga de entrenamiento sRPE (DEP-36). */

type Ctx = { schoolId: string; actorUserId: string };
type Access = { isManager: boolean };

/** Aumento semanal que dispara la alerta (DEP-36). */
export const SPIKE_RATIO = 1.3;

export const periodSchema = z
  .object({
    groupId: z.uuid(),
    kind: z.enum(["MACRO", "MESO"]),
    phase: z.enum(["GENERAL_PREP", "SPECIFIC_PREP", "COMPETITIVE", "TRANSITION"]).nullable(),
    name: z.string().trim().min(3, "Escribe el nombre").max(80),
    objective: z
      .string()
      .trim()
      .max(300)
      .nullish()
      .transform((v) => v ?? ""),
    startsOn: z.iso.date("Escribe la fecha de inicio"),
    endsOn: z.iso.date("Escribe la fecha de cierre"),
    competitionId: z.uuid().nullable(),
  })
  .refine((p) => p.endsOn >= p.startsOn, {
    message: "La fecha de cierre es anterior al inicio",
    path: ["endsOn"],
  });

async function allowed(tx: Parameters<typeof coachGroupIds>[0], ctx: Ctx, groupId: string, access: Access) {
  return access.isManager || (await coachGroupIds(tx, ctx.actorUserId)).includes(groupId);
}

export function createPeriod(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof periodSchema>,
  access: Access,
) {
  const input = periodSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    if (!(await allowed(tx, ctx, input.groupId, access))) return null;
    const [row] = await tx
      .insert(trainingPeriods)
      .values({ schoolId: ctx.schoolId, ...input, createdByUserId: ctx.actorUserId })
      .returning({ id: trainingPeriods.id });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "training_period.created",
      entity: "group",
      entityId: input.groupId,
      data: { kind: input.kind, name: input.name, startsOn: input.startsOn, endsOn: input.endsOn },
    });
    return row.id;
  });
}

export function deletePeriod(database: Database, ctx: Ctx, periodId: string, access: Access) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx.select().from(trainingPeriods).where(eq(trainingPeriods.id, periodId));
    if (!row || !(await allowed(tx, ctx, row.groupId, access))) return false;
    await tx.delete(trainingPeriods).where(eq(trainingPeriods.id, periodId));
    return true;
  });
}

export function listPeriods(database: Database, schoolId: string, groupId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        period: trainingPeriods,
        competitionName: competitions.name,
        competitionDate: competitions.startsOn,
      })
      .from(trainingPeriods)
      .leftJoin(competitions, eq(competitions.id, trainingPeriods.competitionId))
      .where(eq(trainingPeriods.groupId, groupId))
      .orderBy(asc(trainingPeriods.startsOn), asc(trainingPeriods.kind)),
  );
}

/** Lunes de la semana de una fecha. */
export const weekOf = startOfWeek;

/** Semanas con más de 30 % de carga que la anterior (si la anterior tuvo carga). */
export function loadSpikes(weeks: { week: IsoDate; load: number }[]) {
  const out: { week: IsoDate; load: number; previous: number; increase: number }[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1].load;
    if (prev > 0 && weeks[i].load > prev * SPIKE_RATIO)
      out.push({
        week: weeks[i].week,
        load: weeks[i].load,
        previous: prev,
        increase: Math.round((weeks[i].load / prev - 1) * 100),
      });
  }
  return out;
}

/**
 * Carga semanal del grupo (suma de RPE × minutos de cada registro post-sesión) y de cada alumno (las
 * sesiones a las que asistió: presente o tarde), en las `weeks` semanas que terminan en la de `today`.
 */
export function groupLoad(database: Database, schoolId: string, groupId: string, today: IsoDate, weeks = 8) {
  const last = weekOf(today);
  const first = addDays(last, -7 * (weeks - 1));
  const weekList = Array.from({ length: weeks }, (_, i) => addDays(first, 7 * i));
  return runInTenant(database, { schoolId }, async (tx) => {
    const reports = await tx
      .select({
        sessionId: sessions.id,
        date: sessions.date,
        rpe: sessionReports.rpe,
        minutes: sessionReports.minutes,
      })
      .from(sessionReports)
      .innerJoin(sessions, eq(sessions.id, sessionReports.sessionId))
      .where(
        and(eq(sessions.groupId, groupId), gte(sessions.date, first), lte(sessions.date, addDays(last, 6))),
      );
    const marks = reports.length
      ? await tx
          .select({
            sessionId: attendance.sessionId,
            athleteId: attendance.athleteId,
            firstName: athletes.firstName,
            lastName: athletes.lastName,
          })
          .from(attendance)
          .innerJoin(athletes, eq(athletes.id, attendance.athleteId))
          .where(
            and(
              inArray(
                attendance.sessionId,
                reports.map((r) => r.sessionId),
              ),
              inArray(attendance.status, ["PRESENT", "LATE"]),
            ),
          )
      : [];
    const loadOf = new Map(
      reports.map((r) => [r.sessionId, { load: r.rpe * r.minutes, week: weekOf(r.date) }]),
    );
    const group = weekList.map((week) => {
      const own = reports.filter((r) => weekOf(r.date) === week);
      return { week, load: own.reduce((s, r) => s + r.rpe * r.minutes, 0), sessions: own.length };
    });
    const people = new Map<string, { id: string; name: string; weeks: Record<IsoDate, number> }>();
    for (const m of marks) {
      const s = loadOf.get(m.sessionId)!;
      const p = people.get(m.athleteId) ?? {
        id: m.athleteId,
        name: `${m.firstName} ${m.lastName}`,
        weeks: {},
      };
      p.weeks[s.week] = (p.weeks[s.week] ?? 0) + s.load;
      people.set(m.athleteId, p);
    }
    const athletesLoad = [...people.values()]
      .map((p) => {
        const series = weekList.map((week) => ({ week, load: p.weeks[week] ?? 0 }));
        return { ...p, total: series.reduce((s, w) => s + w.load, 0), spikes: loadSpikes(series) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { weeks: group, spikes: loadSpikes(group), athletes: athletesLoad };
  });
}

/**
 * Tarea diaria: si la última semana completa de un grupo superó en más de 30 % a la anterior, avisa a sus
 * profesores (una vez por grupo y semana).
 */
export async function notifyLoadSpikes(
  database: Database,
  school: { id: string; slug: string },
  today: IsoDate,
) {
  const lastComplete = addDays(weekOf(today), -7);
  const active = await runInTenant(database, { schoolId: school.id }, (tx) =>
    tx.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.active, true)),
  );
  let sent = 0;
  for (const g of active) {
    const load = await groupLoad(database, school.id, g.id, addDays(lastComplete, 6), 2);
    const spike = load.spikes.find((s) => s.week === lastComplete);
    if (!spike) continue;
    sent += await runInTenant(database, { schoolId: school.id }, async (tx) => {
      const users = await tx
        .selectDistinct({ userId: coaches.userId })
        .from(groupCoaches)
        .innerJoin(coaches, eq(coaches.id, groupCoaches.coachId))
        .where(eq(groupCoaches.groupId, g.id));
      const ids = users.map((u) => u.userId).filter((u): u is string => Boolean(u));
      await notifyUsers(tx, school.id, ids, {
        kind: "training.load_spike",
        title: `Carga alta en ${g.name}`,
        body: `La semana del ${spike.week} subió ${spike.increase} % frente a la anterior. Revisa la planificación.`,
        href: `/${school.slug}/entrenamiento/grupos/${g.id}`,
        dedupeKey: `load.spike:${g.id}:${spike.week}`,
      });
      return ids.length ? 1 : 0;
    });
  }
  return sent;
}
