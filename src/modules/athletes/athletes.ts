import { and, asc, count, desc, eq, ilike, inArray, lte, ne, or, sql } from "drizzle-orm";
import { allVisible } from "@/db/ownership";
import { pgErrorCode, runInTenant, type Database, type Tx } from "@/db/rls";
import {
  athleteGuardians,
  athletes,
  auditLogs,
  enrollments,
  feePlans,
  groups,
  guardians,
  relationshipEnum,
} from "@/db/schema";
import { familyUserIds, notifyUsers } from "@/modules/notifications/notify";
import { decryptField, encryptField } from "@/lib/crypto";
import {
  ADULT_AGE,
  CURRENT_STATUSES,
  ageOn,
  canTransition,
  type EnrollmentStatus,
  type WithdrawalReason,
} from "./enrollment-status";
import {
  enrollmentInputSchema,
  type AthleteInput,
  type EnrollmentInput,
  type GuardianInput,
} from "./schemas";

type Ctx = { schoolId: string; actorUserId: string };
type Relationship = (typeof relationshipEnum.enumValues)[number];

export type AthleteError =
  | "document_taken"
  | "guardian_required"
  | "group_full"
  | "invalid_reference"
  | "already_enrolled"
  | "invalid_transition"
  | "not_found";

export const ATHLETE_ERROR_MESSAGES: Record<AthleteError, string> = {
  document_taken: "Ya existe un alumno con ese documento en la escuela",
  guardian_required: "Un alumno menor de edad necesita un acudiente responsable de pago",
  group_full: "El grupo está lleno",
  invalid_reference: "El grupo o la tarifa no son válidos",
  already_enrolled: "El alumno ya tiene una matrícula vigente en ese grupo",
  invalid_transition: "Ese cambio de estado no está permitido",
  not_found: "No encontramos el registro",
};

class DomainError extends Error {
  constructor(readonly code: AthleteError) {
    super(code);
  }
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: AthleteError };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.code };
    if (pgErrorCode(err) === "23505") {
      const constraint = (err as { cause?: { constraint_name?: string } }).cause?.constraint_name ?? "";
      return {
        ok: false,
        error: constraint.startsWith("enrollments") ? "already_enrolled" : "document_taken",
      };
    }
    throw err;
  }
}

async function audit(tx: Tx, ctx: Ctx, action: string, entity: string, entityId: string, data: object = {}) {
  await tx
    .insert(auditLogs)
    .values({ schoolId: ctx.schoolId, actorUserId: ctx.actorUserId, action, entity, entityId, data });
}

function athleteRow(input: AthleteInput) {
  const { medicalNotes, ...rest } = input;
  return { ...rest, medicalNotesEncrypted: encryptField(medicalNotes) };
}

/** Busca al acudiente por celular dentro de la escuela; si no existe lo crea (hermanos comparten acudiente). */
async function findOrCreateGuardian(tx: Tx, schoolId: string, input: GuardianInput) {
  const [existing] = await tx.select().from(guardians).where(eq(guardians.phone, input.phone));
  if (existing) return existing;
  const [created] = await tx
    .insert(guardians)
    .values({ schoolId, ...input })
    .returning();
  return created;
}

async function insertEnrollment(tx: Tx, schoolId: string, athleteId: string, raw: EnrollmentInput) {
  const input = enrollmentInputSchema.parse(raw);
  if (
    !(await allVisible(tx, groups, [input.groupId])) ||
    !(await allVisible(tx, feePlans, [input.feePlanId]))
  ) {
    throw new DomainError("invalid_reference");
  }
  if (!input.allowOverCapacity) {
    const [group] = await tx
      .select({ capacity: groups.capacity })
      .from(groups)
      .where(eq(groups.id, input.groupId));
    const [{ value: enrolled }] = await tx
      .select({ value: count() })
      .from(enrollments)
      .where(and(eq(enrollments.groupId, input.groupId), inArray(enrollments.status, CURRENT_STATUSES)));
    if (enrolled >= group.capacity) throw new DomainError("group_full");
  }
  const [enrollment] = await tx
    .insert(enrollments)
    .values({
      schoolId,
      athleteId,
      groupId: input.groupId,
      feePlanId: input.feePlanId,
      startDate: input.startDate,
      status: input.status,
    })
    .returning();
  return enrollment;
}

export type CreateAthleteInput = {
  athlete: AthleteInput;
  guardian: (GuardianInput & { relationship: Relationship }) | null;
  enrollment: EnrollmentInput | null;
  today: string;
};

/** Alta de alumno con su acudiente responsable de pago y, opcionalmente, su matrícula. */
export function createAthlete(database: Database, ctx: Ctx, input: CreateAthleteInput) {
  return run(() =>
    runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      const isAdult = ageOn(input.athlete.birthDate, input.today) >= ADULT_AGE;
      if (!isAdult && !input.guardian) throw new DomainError("guardian_required");

      const [athlete] = await tx
        .insert(athletes)
        .values({ schoolId: ctx.schoolId, ...athleteRow(input.athlete) })
        .returning({ id: athletes.id });

      if (input.guardian) {
        const { relationship, ...guardianData } = input.guardian;
        const guardian = await findOrCreateGuardian(tx, ctx.schoolId, guardianData);
        await tx.insert(athleteGuardians).values({
          schoolId: ctx.schoolId,
          athleteId: athlete.id,
          guardianId: guardian.id,
          relationship,
          isPayer: true,
        });
      }

      if (input.enrollment) await insertEnrollment(tx, ctx.schoolId, athlete.id, input.enrollment);
      await audit(tx, ctx, "athlete.created", "athlete", athlete.id);
      return { athleteId: athlete.id };
    }),
  );
}

export function updateAthlete(database: Database, ctx: Ctx, athleteId: string, input: AthleteInput) {
  return run(() =>
    runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      const [row] = await tx
        .update(athletes)
        .set(athleteRow(input))
        .where(eq(athletes.id, athleteId))
        .returning({ id: athletes.id });
      if (!row) throw new DomainError("not_found");
      await audit(tx, ctx, "athlete.updated", "athlete", athleteId);
      return {};
    }),
  );
}

export function enrollAthlete(database: Database, ctx: Ctx, athleteId: string, input: EnrollmentInput) {
  return run(() =>
    runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      if (!(await allVisible(tx, athletes, [athleteId]))) throw new DomainError("not_found");
      const enrollment = await insertEnrollment(tx, ctx.schoolId, athleteId, input);
      await audit(tx, ctx, "enrollment.created", "enrollment", enrollment.id, input);
      return { enrollmentId: enrollment.id };
    }),
  );
}

export type StatusChange =
  | { to: "ACTIVE"; date: string }
  | { to: "FROZEN"; date: string; frozenUntil: string | null; notes?: string | null }
  | { to: "WITHDRAWN"; date: string; reason: WithdrawalReason; notes?: string | null }
  | { to: "DISCARDED"; date: string; notes?: string | null };

/** Congelar, retirar, reactivar o descartar una matrícula, respetando las transiciones válidas. */
export function changeEnrollmentStatus(
  database: Database,
  ctx: Ctx,
  enrollmentId: string,
  change: StatusChange,
) {
  return run(() =>
    runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      const [current] = await tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
      if (!current) throw new DomainError("not_found");
      if (!canTransition(current.status, change.to)) throw new DomainError("invalid_transition");

      await tx
        .update(enrollments)
        .set({
          status: change.to,
          frozenUntil: change.to === "FROZEN" ? change.frozenUntil : null,
          withdrawalReason: change.to === "WITHDRAWN" ? change.reason : null,
          endDate: change.to === "WITHDRAWN" || change.to === "DISCARDED" ? change.date : null,
          statusNotes: "notes" in change ? (change.notes ?? null) : null,
        })
        .where(eq(enrollments.id, enrollmentId));
      await audit(tx, ctx, `enrollment.${change.to.toLowerCase()}`, "enrollment", enrollmentId, {
        from: current.status,
        ...change,
      });
      return {};
    }),
  );
}

/** Agrega otro acudiente (o el mismo celular ya registrado) a un alumno. */
export function addGuardianToAthlete(
  database: Database,
  ctx: Ctx,
  athleteId: string,
  input: GuardianInput & { relationship: Relationship; isPayer: boolean },
) {
  return run(() =>
    runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      if (!(await allVisible(tx, athletes, [athleteId]))) throw new DomainError("not_found");
      const { relationship, isPayer, ...data } = input;
      const guardian = await findOrCreateGuardian(tx, ctx.schoolId, data);
      if (isPayer) {
        await tx
          .update(athleteGuardians)
          .set({ isPayer: false })
          .where(eq(athleteGuardians.athleteId, athleteId));
      }
      await tx
        .insert(athleteGuardians)
        .values({ schoolId: ctx.schoolId, athleteId, guardianId: guardian.id, relationship, isPayer })
        .onConflictDoUpdate({
          target: [athleteGuardians.athleteId, athleteGuardians.guardianId],
          set: { relationship, isPayer },
        });
      await audit(tx, ctx, "athlete.guardian_added", "athlete", athleteId, {
        guardianId: guardian.id,
        isPayer,
      });
      return { guardianId: guardian.id };
    }),
  );
}

export function setPayer(database: Database, ctx: Ctx, athleteId: string, guardianId: string) {
  return run(() =>
    runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      await tx
        .update(athleteGuardians)
        .set({ isPayer: false })
        .where(eq(athleteGuardians.athleteId, athleteId));
      const [link] = await tx
        .update(athleteGuardians)
        .set({ isPayer: true })
        .where(and(eq(athleteGuardians.athleteId, athleteId), eq(athleteGuardians.guardianId, guardianId)))
        .returning();
      if (!link) throw new DomainError("not_found");
      await audit(tx, ctx, "athlete.payer_changed", "athlete", athleteId, { guardianId });
      return {};
    }),
  );
}

/** Quita un acudiente que no es el responsable de pago. */
export function removeGuardianFromAthlete(
  database: Database,
  ctx: Ctx,
  athleteId: string,
  guardianId: string,
) {
  return run(() =>
    runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      const [link] = await tx
        .delete(athleteGuardians)
        .where(
          and(
            eq(athleteGuardians.athleteId, athleteId),
            eq(athleteGuardians.guardianId, guardianId),
            eq(athleteGuardians.isPayer, false),
          ),
        )
        .returning();
      if (!link) throw new DomainError("not_found");
      await audit(tx, ctx, "athlete.guardian_removed", "athlete", athleteId, { guardianId });
      return {};
    }),
  );
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export type AthleteFilters = { query?: string; groupId?: string; status?: "current" | "withdrawn" | "all" };

export type AthleteListItem = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  documentNumber: string | null;
  payer: { name: string; phone: string } | null;
  enrollments: { groupName: string; groupColor: string; status: EnrollmentStatus }[];
};

export function listAthletes(database: Database, schoolId: string, filters: AthleteFilters = {}) {
  return runInTenant(database, { schoolId }, async (tx): Promise<AthleteListItem[]> => {
    const conditions = [];
    const q = filters.query?.trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      conditions.push(
        or(
          ilike(sql`${athletes.firstName} || ' ' || ${athletes.lastName}`, like),
          ilike(athletes.documentNumber, like),
        ),
      );
    }
    const current = sql.join(
      CURRENT_STATUSES.map((st) => sql`${st}`),
      sql`, `,
    );
    const hasCurrent = sql`exists (select 1 from ${enrollments} e where e.athlete_id = ${athletes.id} and e.status in (${current}))`;
    const hasAny = sql`exists (select 1 from ${enrollments} e where e.athlete_id = ${athletes.id})`;
    const status = filters.status ?? "current";
    // Vigentes: con matrícula vigente o recién creados sin matrícula. Retirados: sin matrícula vigente.
    if (status === "current") conditions.push(or(hasCurrent, sql`not ${hasAny}`));
    if (status === "withdrawn") conditions.push(and(hasAny, sql`not ${hasCurrent}`));
    if (filters.groupId) {
      conditions.push(
        sql`exists (select 1 from ${enrollments} e where e.athlete_id = ${athletes.id} and e.group_id = ${filters.groupId}${
          status === "all" ? sql`` : sql` and e.status in (${current})`
        })`,
      );
    }

    const rows = await tx
      .select()
      .from(athletes)
      .where(and(...conditions))
      .orderBy(asc(athletes.firstName), asc(athletes.lastName))
      .limit(500);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const [payers, enrollmentRows] = await Promise.all([
      tx
        .select({ athleteId: athleteGuardians.athleteId, guardian: guardians })
        .from(athleteGuardians)
        .innerJoin(guardians, eq(guardians.id, athleteGuardians.guardianId))
        .where(and(inArray(athleteGuardians.athleteId, ids), eq(athleteGuardians.isPayer, true))),
      tx
        .select({
          athleteId: enrollments.athleteId,
          status: enrollments.status,
          groupName: groups.name,
          groupColor: groups.color,
        })
        .from(enrollments)
        .innerJoin(groups, eq(groups.id, enrollments.groupId))
        .where(and(inArray(enrollments.athleteId, ids), ne(enrollments.status, "DISCARDED")))
        .orderBy(desc(enrollments.startDate)),
    ]);

    return rows.map((a) => {
      const payer = payers.find((p) => p.athleteId === a.id)?.guardian;
      return {
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        birthDate: a.birthDate,
        documentNumber: a.documentNumber,
        payer: payer ? { name: `${payer.firstName} ${payer.lastName}`, phone: payer.phone } : null,
        enrollments: enrollmentRows
          .filter((e) => e.athleteId === a.id)
          .map(({ groupName, groupColor, status }) => ({ groupName, groupColor, status })),
      };
    });
  });
}

export function getAthlete(database: Database, schoolId: string, athleteId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [athlete] = await tx.select().from(athletes).where(eq(athletes.id, athleteId));
    if (!athlete) return null;
    const [guardianRows, enrollmentRows] = await Promise.all([
      tx
        .select({
          guardian: guardians,
          relationship: athleteGuardians.relationship,
          isPayer: athleteGuardians.isPayer,
        })
        .from(athleteGuardians)
        .innerJoin(guardians, eq(guardians.id, athleteGuardians.guardianId))
        .where(eq(athleteGuardians.athleteId, athleteId))
        .orderBy(desc(athleteGuardians.isPayer), asc(guardians.firstName)),
      tx
        .select({
          enrollment: enrollments,
          groupName: groups.name,
          groupColor: groups.color,
          feePlanName: feePlans.name,
          monthlyAmount: feePlans.monthlyAmount,
        })
        .from(enrollments)
        .innerJoin(groups, eq(groups.id, enrollments.groupId))
        .innerJoin(feePlans, eq(feePlans.id, enrollments.feePlanId))
        .where(eq(enrollments.athleteId, athleteId))
        .orderBy(desc(enrollments.createdAt)),
    ]);
    const { medicalNotesEncrypted, ...rest } = athlete;
    return {
      athlete: { ...rest, medicalNotes: decryptField(medicalNotesEncrypted) },
      guardians: guardianRows,
      enrollments: enrollmentRows,
    };
  });
}

/**
 * ADM-13: las matrículas congeladas vuelven a ACTIVE el día de `frozen_until` (idempotente).
 * Avisa a las familias con cuenta.
 */
export function reactivateFrozenEnrollments(
  database: Database,
  school: { id: string; slug: string },
  today: string,
) {
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    const due = await tx
      .update(enrollments)
      .set({ status: "ACTIVE", frozenUntil: null, statusNotes: null })
      .where(and(eq(enrollments.status, "FROZEN"), lte(enrollments.frozenUntil, today)))
      .returning({ id: enrollments.id, athleteId: enrollments.athleteId, groupId: enrollments.groupId });
    for (const e of due) {
      await tx.insert(auditLogs).values({
        schoolId: school.id,
        actorUserId: null,
        action: "enrollment.auto_reactivated",
        entity: "enrollment",
        entityId: e.id,
        data: { date: today },
      });
      const [athlete] = await tx
        .select({ firstName: athletes.firstName })
        .from(athletes)
        .where(eq(athletes.id, e.athleteId));
      const [group] = await tx.select({ name: groups.name }).from(groups).where(eq(groups.id, e.groupId));
      await notifyUsers(tx, school.id, await familyUserIds(tx, [e.athleteId]), {
        kind: "enrollment.reactivated",
        title: `${athlete?.firstName ?? "La matrícula"} vuelve a clases`,
        body: `Terminó el congelamiento: la matrícula en ${group?.name ?? "el grupo"} está activa desde hoy.`,
        href: `/${school.slug}`,
      });
    }
    return due.length;
  });
}
