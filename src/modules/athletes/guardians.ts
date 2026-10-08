import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { pgErrorCode, runInTenant, type Database } from "@/db/rls";
import { athleteGuardians, athletes, auditLogs, guardians } from "@/db/schema";
import type { GuardianInput } from "./schemas";

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

/** Acudiente con sus alumnos (ficha del acudiente). */
export async function getGuardian(database: Database, schoolId: string, guardianId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [guardian] = await tx.select().from(guardians).where(eq(guardians.id, guardianId));
    if (!guardian) return null;
    const links = await tx
      .select({
        id: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        relationship: athleteGuardians.relationship,
        isPayer: athleteGuardians.isPayer,
      })
      .from(athleteGuardians)
      .innerJoin(athletes, eq(athletes.id, athleteGuardians.athleteId))
      .where(eq(athleteGuardians.guardianId, guardianId))
      .orderBy(asc(athletes.firstName));
    return { guardian, athletes: links };
  });
}

export type UpdateGuardianResult = { ok: true } | { ok: false; error: "not_found" | "phone_taken" };

/** Edita los datos del acudiente; el celular es único por escuela (índice `guardians_school_phone_uq`). */
export function updateGuardian(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  guardianId: string,
  input: GuardianInput,
): Promise<UpdateGuardianResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx): Promise<UpdateGuardianResult> => {
    const [before] = await tx.select().from(guardians).where(eq(guardians.id, guardianId));
    if (!before) return { ok: false, error: "not_found" };
    await tx.update(guardians).set(input).where(eq(guardians.id, guardianId));
    const changed = (Object.keys(input) as (keyof GuardianInput)[]).filter((k) => before[k] !== input[k]);
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "guardian.updated",
      entity: "guardian",
      entityId: guardianId,
      data: { changed },
    });
    return { ok: true };
  }).catch((err) => {
    if (pgErrorCode(err) === "23505") return { ok: false as const, error: "phone_taken" as const };
    throw err;
  });
}
