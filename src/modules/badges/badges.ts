import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import {
  athleteBadges,
  athleteLevels,
  athletes,
  attendance,
  auditLogs,
  competitionEntries,
  competitionResults,
  enrollments,
  levels,
  performances,
  schools,
  sessions,
  sportTests,
} from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { familyUserIds, notifyUsers } from "@/modules/notifications/notify";
import { isBetter } from "@/modules/sports/format";
import { BADGES, BADGE_CODES, STREAK_STEPS, type BadgeCode } from "./labels";

/** Logros e insignias automáticas (GESTION_DEPORTIVA §10). */

type Candidate = { athleteId: string; badge: BadgeCode; key: string; label: string };

export function readBadgeSettings(raw: unknown): { disabled: BadgeCode[] } {
  const disabled = (raw as { disabled?: unknown } | undefined)?.disabled;
  return {
    disabled: Array.isArray(disabled) ? disabled.filter((d): d is BadgeCode => BADGE_CODES.includes(d)) : [],
  };
}

/** Racha más larga de clases sin falta: presente o tarde suman, ausente corta, la excusa no cuenta. */
export function longestStreak(statuses: string[]) {
  let best = 0;
  let run = 0;
  for (const s of statuses) {
    if (s === "PRESENT" || s === "LATE") best = Math.max(best, ++run);
    else if (s === "ABSENT") run = 0;
  }
  return best;
}

/** Años cumplidos entre dos fechas ISO. */
export function fullYears(from: IsoDate, to: IsoDate) {
  const years = Number(to.slice(0, 4)) - Number(from.slice(0, 4));
  return to.slice(5) >= from.slice(5) ? years : years - 1;
}

/**
 * Otorga las insignias que falten (idempotente) y avisa a la familia por cada nueva. Sin `athleteIds`
 * revisa a todos los alumnos con matrícula vigente (tarea diaria).
 */
export function awardBadges(
  database: Database,
  school: { id: string; slug: string },
  today: IsoDate,
  athleteIds?: string[],
) {
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    const [row] = await tx
      .select({ settings: schools.settings })
      .from(schools)
      .where(eq(schools.id, school.id));
    const { disabled } = readBadgeSettings(row?.settings.badges);
    const ids =
      athleteIds ??
      (
        await tx
          .selectDistinct({ id: enrollments.athleteId })
          .from(enrollments)
          .where(inArray(enrollments.status, ["ACTIVE", "FROZEN"]))
      ).map((r) => r.id);
    if (ids.length === 0) return 0;
    const on = (badge: BadgeCode) => !disabled.includes(badge);
    const candidates: Candidate[] = [];

    const [marks, promotions, medals, starts, people] = await Promise.all([
      on("STREAK") || on("CENTURY")
        ? tx
            .select({ athleteId: attendance.athleteId, status: attendance.status })
            .from(attendance)
            .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
            .where(and(inArray(attendance.athleteId, ids), sql`${sessions.date} <= ${today}`))
            .orderBy(asc(sessions.date), asc(sessions.startTime))
        : [],
      on("LEVEL_UP")
        ? tx
            .select({ athleteId: athleteLevels.athleteId, levelId: levels.id, name: levels.name })
            .from(athleteLevels)
            .innerJoin(levels, eq(levels.id, athleteLevels.levelId))
            .where(and(inArray(athleteLevels.athleteId, ids), isNotNull(athleteLevels.evaluationId)))
        : [],
      on("FIRST_PODIUM")
        ? tx
            .selectDistinct({ athleteId: competitionEntries.athleteId })
            .from(competitionResults)
            .innerJoin(competitionEntries, eq(competitionEntries.id, competitionResults.entryId))
            .where(and(inArray(competitionEntries.athleteId, ids), isNotNull(competitionResults.medal)))
        : [],
      on("ANNIVERSARY")
        ? tx
            .select({ athleteId: enrollments.athleteId, start: sql<string>`min(${enrollments.startDate})` })
            .from(enrollments)
            .where(inArray(enrollments.athleteId, ids))
            .groupBy(enrollments.athleteId)
        : [],
      tx
        .select({ id: athletes.id, firstName: athletes.firstName })
        .from(athletes)
        .where(inArray(athletes.id, ids)),
    ]);

    for (const id of ids) {
      const statuses = marks.filter((m) => m.athleteId === id).map((m) => m.status);
      if (on("STREAK")) {
        const streak = longestStreak(statuses);
        for (const step of STREAK_STEPS)
          if (streak >= step)
            candidates.push({
              athleteId: id,
              badge: "STREAK",
              key: String(step),
              label: `${step} clases seguidas`,
            });
      }
      if (on("CENTURY") && statuses.filter((s) => s === "PRESENT" || s === "LATE").length >= 100)
        candidates.push({ athleteId: id, badge: "CENTURY", key: "100", label: "100 asistencias" });
    }
    for (const p of promotions)
      candidates.push({
        athleteId: p.athleteId,
        badge: "LEVEL_UP",
        key: p.levelId,
        label: `Subí a ${p.name}`,
      });
    for (const m of medals)
      candidates.push({ athleteId: m.athleteId, badge: "FIRST_PODIUM", key: "", label: "Primer podio" });
    for (const s of starts) {
      const years = s.start ? fullYears(s.start, today) : 0;
      for (let y = 1; y <= years; y++)
        candidates.push({
          athleteId: s.athleteId,
          badge: "ANNIVERSARY",
          key: String(y),
          label: y === 1 ? "1 año en la escuela" : `${y} años en la escuela`,
        });
    }
    if (on("PERSONAL_BEST")) {
      const rows = await tx
        .select({
          athleteId: performances.athleteId,
          testId: sportTests.id,
          testName: sportTests.name,
          lowerIsBetter: sportTests.lowerIsBetter,
          timing: performances.timing,
          value: performances.value,
        })
        .from(performances)
        .innerJoin(sportTests, eq(sportTests.id, performances.testId))
        .where(inArray(performances.athleteId, ids))
        .orderBy(asc(performances.recordedOn), asc(performances.createdAt));
      const best = new Map<string, number>();
      const done = new Set<string>();
      for (const r of rows) {
        const k = `${r.athleteId}:${r.testId}:${r.timing}`;
        const prev = best.get(k);
        if (prev === undefined || isBetter(r.value, prev, r.lowerIsBetter)) {
          best.set(k, r.value);
          const badgeKey = `${r.athleteId}:${r.testId}`;
          if (prev !== undefined && !done.has(badgeKey)) {
            done.add(badgeKey);
            candidates.push({
              athleteId: r.athleteId,
              badge: "PERSONAL_BEST",
              key: r.testId,
              label: `Récord personal en ${r.testName}`,
            });
          }
        }
      }
    }
    if (candidates.length === 0) return 0;

    const inserted = await tx
      .insert(athleteBadges)
      .values(candidates.map((c) => ({ schoolId: school.id, ...c, awardedOn: today })))
      .onConflictDoNothing()
      .returning();
    for (const b of inserted) {
      const person = people.find((p) => p.id === b.athleteId);
      await notifyUsers(tx, school.id, await familyUserIds(tx, [b.athleteId]), {
        kind: "badge.awarded",
        title: `¡${person?.firstName ?? "Tu hijo(a)"} ganó una insignia! ${BADGES[b.badge].emoji}`,
        body: b.label,
        href: `/${school.slug}/mis-hijos`,
        dedupeKey: `badge:${b.id}`,
      });
    }
    return inserted.length;
  });
}

export function listBadges(database: Database, schoolId: string, athleteId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(athleteBadges)
      .where(eq(athleteBadges.athleteId, athleteId))
      .orderBy(asc(athleteBadges.awardedOn), asc(athleteBadges.createdAt)),
  );
}

export function updateBadgeSettings(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  disabled: BadgeCode[],
) {
  const value = { disabled: disabled.filter((d) => BADGE_CODES.includes(d)) };
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx
      .update(schools)
      .set({ settings: sql`jsonb_set(${schools.settings}, '{badges}', ${JSON.stringify(value)}::jsonb)` })
      .where(eq(schools.id, ctx.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "badges.settings_updated",
      entity: "school",
      entityId: ctx.schoolId,
      data: value,
    });
  });
}
