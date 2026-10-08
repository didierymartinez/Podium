import { and, asc, eq, inArray } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { athleteGuardians, athletes, coaches, enrollments, groupCoaches, guardians } from "@/db/schema";
import { CURRENT_STATUSES, type EnrollmentStatus } from "@/modules/athletes/enrollment-status";
import { listGroups, type GroupSummary } from "@/modules/groups/groups";

export type MemberAthlete = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  photoFileId: string | null;
  isPayer: boolean | null;
  enrollments: { status: EnrollmentStatus; group: GroupSummary }[];
};

export type MemberHome = {
  /** Hijos del acudiente (o el propio alumno). */
  athletes: MemberAthlete[];
  /** Grupos del profesor con sus alumnos vigentes. */
  coachGroups: {
    group: GroupSummary;
    role: "HEAD" | "ASSISTANT";
    athletes: { id: string; name: string; birthDate: string }[];
  }[];
};

/**
 * Lo que ve un miembro que no administra la escuela (acudiente, alumno o profesor).
 * Siempre filtra por las personas vinculadas a su usuario.
 */
export async function getMemberHome(
  database: Database,
  schoolId: string,
  userId: string,
): Promise<MemberHome> {
  const allGroups = await listGroups(database, schoolId);
  const groupById = new Map(allGroups.map((g) => [g.id, g]));

  return runInTenant(database, { schoolId }, async (tx) => {
    const [asGuardian, asAthlete, asCoach] = await Promise.all([
      tx
        .select({ athlete: athletes, isPayer: athleteGuardians.isPayer })
        .from(guardians)
        .innerJoin(athleteGuardians, eq(athleteGuardians.guardianId, guardians.id))
        .innerJoin(athletes, eq(athletes.id, athleteGuardians.athleteId))
        .where(eq(guardians.userId, userId)),
      tx.select().from(athletes).where(eq(athletes.userId, userId)),
      tx
        .select({ groupId: groupCoaches.groupId, role: groupCoaches.role })
        .from(coaches)
        .innerJoin(groupCoaches, eq(groupCoaches.coachId, coaches.id))
        .where(and(eq(coaches.userId, userId), eq(coaches.active, true))),
    ]);

    const people = new Map<string, { athlete: typeof athletes.$inferSelect; isPayer: boolean | null }>();
    for (const row of asGuardian) people.set(row.athlete.id, row);
    for (const athlete of asAthlete)
      if (!people.has(athlete.id)) people.set(athlete.id, { athlete, isPayer: null });

    const athleteIds = [...people.keys()];
    const athleteEnrollments = athleteIds.length
      ? await tx
          .select()
          .from(enrollments)
          .where(
            and(inArray(enrollments.athleteId, athleteIds), inArray(enrollments.status, CURRENT_STATUSES)),
          )
      : [];

    const coachGroupIds = asCoach.map((c) => c.groupId).filter((id) => groupById.get(id)?.active);
    const roster = coachGroupIds.length
      ? await tx
          .select({
            groupId: enrollments.groupId,
            id: athletes.id,
            firstName: athletes.firstName,
            lastName: athletes.lastName,
            birthDate: athletes.birthDate,
          })
          .from(enrollments)
          .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
          .where(
            and(
              inArray(enrollments.groupId, coachGroupIds),
              inArray(enrollments.status, ["ACTIVE", "FROZEN"]),
            ),
          )
          .orderBy(asc(athletes.firstName))
      : [];

    return {
      athletes: [...people.values()]
        .map(({ athlete, isPayer }) => ({
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          birthDate: athlete.birthDate,
          photoFileId: athlete.photoFileId,
          isPayer,
          enrollments: athleteEnrollments
            .filter((e) => e.athleteId === athlete.id && groupById.has(e.groupId))
            .map((e) => ({ status: e.status, group: groupById.get(e.groupId)! })),
        }))
        .sort((a, b) => a.firstName.localeCompare(b.firstName)),
      coachGroups: asCoach
        .filter((c) => groupById.get(c.groupId)?.active)
        .map((c) => ({
          group: groupById.get(c.groupId)!,
          role: c.role,
          athletes: roster
            .filter((r) => r.groupId === c.groupId)
            .map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, birthDate: r.birthDate })),
        })),
    };
  });
}
