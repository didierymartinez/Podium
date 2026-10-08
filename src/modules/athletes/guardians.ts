import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { athleteGuardians, athletes, guardians } from "@/db/schema";

export type GuardianListItem = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  userId: string | null;
  hasAccount: boolean;
  athletes: { id: string; name: string; isPayer: boolean }[];
};

export function listGuardians(database: Database, schoolId: string, query?: string) {
  return runInTenant(database, { schoolId }, async (tx): Promise<GuardianListItem[]> => {
    const q = query?.trim();
    const like = q ? `%${q.replace(/[%_]/g, "")}%` : null;
    const rows = await tx
      .select()
      .from(guardians)
      .where(
        like
          ? or(
              ilike(sql`${guardians.firstName} || ' ' || ${guardians.lastName}`, like),
              ilike(guardians.phone, like),
            )
          : undefined,
      )
      .orderBy(asc(guardians.firstName), asc(guardians.lastName))
      .limit(500);
    if (rows.length === 0) return [];
    const links = await tx
      .select({
        guardianId: athleteGuardians.guardianId,
        isPayer: athleteGuardians.isPayer,
        athleteId: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
      })
      .from(athleteGuardians)
      .innerJoin(athletes, eq(athletes.id, athleteGuardians.athleteId))
      .where(
        inArray(
          athleteGuardians.guardianId,
          rows.map((r) => r.id),
        ),
      );
    return rows.map((g) => ({
      id: g.id,
      firstName: g.firstName,
      lastName: g.lastName,
      phone: g.phone,
      email: g.email,
      userId: g.userId,
      hasAccount: g.userId !== null,
      athletes: links
        .filter((l) => l.guardianId === g.id)
        .map((l) => ({ id: l.athleteId, name: `${l.firstName} ${l.lastName}`, isPayer: l.isPayer })),
    }));
  });
}

/** Busca un acudiente existente por celular (para sugerirlo al crear un hermano). */
export async function findGuardianByPhone(database: Database, schoolId: string, phone: string) {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(guardians)
      .where(and(eq(guardians.schoolId, schoolId), eq(guardians.phone, phone))),
  );
  return row ?? null;
}
