import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import { athletes, auditLogs, bodyConsents, bodyMeasurements, initialAssessments } from "@/db/schema";
import { decryptField, encryptField } from "@/lib/crypto";
import type { IsoDate } from "@/lib/dates";

/**
 * Valoración inicial y composición corporal (EVALUACION_GIMNASIOS §4, DEP-56). Las medidas solo se
 * registran con el permiso vigente del acudiente.
 */

type Ctx = { schoolId: string; actorUserId: string };

const longText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v ?? "");

export const assessmentSchema = z.object({
  assessedOn: z.iso.date("Escribe la fecha"),
  goals: longText(1000),
  sportsBackground: longText(1000),
  healthHistory: longText(1500),
  notes: longText(1000),
});

export function saveAssessment(
  database: Database,
  ctx: Ctx,
  athleteId: string,
  raw: z.input<typeof assessmentSchema>,
) {
  const input = assessmentSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [athlete] = await tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.id, athleteId));
    if (!athlete) return false;
    const values = {
      assessedOn: input.assessedOn,
      goals: input.goals,
      sportsBackground: input.sportsBackground,
      healthHistoryEncrypted: encryptField(input.healthHistory || null),
      notes: input.notes,
      assessedByUserId: ctx.actorUserId,
    };
    await tx
      .insert(initialAssessments)
      .values({ schoolId: ctx.schoolId, athleteId, ...values })
      .onConflictDoUpdate({ target: initialAssessments.athleteId, set: values });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "athlete.assessment_saved",
      entity: "athlete",
      entityId: athleteId,
      data: { assessedOn: input.assessedOn },
    });
    return true;
  });
}

/**
 * Valoración, permiso y mediciones del alumno. `includeHealth` descifra los antecedentes (solo la
 * administración); en el portal va dentro de `asPortalUser`.
 */
export function bodyProfile(
  database: Database,
  schoolId: string,
  athleteId: string,
  opts: { includeHealth: boolean },
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [[assessment], [consent], measurements] = await Promise.all([
      tx.select().from(initialAssessments).where(eq(initialAssessments.athleteId, athleteId)),
      tx.select().from(bodyConsents).where(eq(bodyConsents.athleteId, athleteId)),
      tx
        .select()
        .from(bodyMeasurements)
        .where(eq(bodyMeasurements.athleteId, athleteId))
        .orderBy(asc(bodyMeasurements.measuredOn), asc(bodyMeasurements.createdAt)),
    ]);
    return {
      assessment: assessment
        ? {
            assessedOn: assessment.assessedOn,
            goals: assessment.goals,
            sportsBackground: assessment.sportsBackground,
            notes: assessment.notes,
            healthHistory: opts.includeHealth
              ? (decryptField(assessment.healthHistoryEncrypted) ?? "")
              : null,
          }
        : null,
      consent:
        consent && !consent.revokedAt ? { grantedAt: consent.grantedAt, source: consent.source } : null,
      measurements,
    };
  });
}

/** Permiso del acudiente (en el portal, dentro de `asPortalUser`) o registrado por la escuela. */
export function grantBodyConsent(
  database: Database,
  schoolId: string,
  athleteId: string,
  userId: string,
  source: "family" | "school",
  now: Date,
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [athlete] = await tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.id, athleteId));
    if (!athlete) return false;
    const values = { grantedAt: now, grantedByUserId: userId, source, revokedAt: null };
    await tx
      .insert(bodyConsents)
      .values({ schoolId, athleteId, ...values })
      .onConflictDoUpdate({ target: bodyConsents.athleteId, set: values });
    await tx.insert(auditLogs).values({
      schoolId,
      actorUserId: userId,
      action: "athlete.body_consent_granted",
      entity: "athlete",
      entityId: athleteId,
      data: { source },
    });
    return true;
  });
}

export function revokeBodyConsent(
  database: Database,
  schoolId: string,
  athleteId: string,
  userId: string,
  now: Date,
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const updated = await tx
      .update(bodyConsents)
      .set({ revokedAt: now })
      .where(and(eq(bodyConsents.athleteId, athleteId), isNull(bodyConsents.revokedAt)))
      .returning({ id: bodyConsents.id });
    if (updated.length)
      await tx.insert(auditLogs).values({
        schoolId,
        actorUserId: userId,
        action: "athlete.body_consent_revoked",
        entity: "athlete",
        entityId: athleteId,
        data: {},
      });
    return updated.length > 0;
  });
}

const metric = (max: number) => z.number().positive().max(max).nullable();

export const measurementSchema = z
  .object({
    measuredOn: z.iso.date("Escribe la fecha"),
    source: z.enum(["MANUAL", "INBODY"]),
    weightKg: metric(300),
    heightCm: metric(250),
    wingspanCm: metric(260),
    skeletalMuscleKg: metric(150),
    bodyFatKg: metric(200),
    bodyFatPercent: metric(70),
    visceralFat: metric(30),
    bodyWaterKg: metric(150),
    basalMetabolismKcal: z.number().int().positive().max(6000).nullable(),
    notes: z
      .string()
      .trim()
      .max(300)
      .nullish()
      .transform((v) => v || null),
  })
  .refine(
    (m) =>
      [
        m.weightKg,
        m.heightCm,
        m.wingspanCm,
        m.skeletalMuscleKg,
        m.bodyFatKg,
        m.bodyFatPercent,
        m.visceralFat,
        m.bodyWaterKg,
        m.basalMetabolismKcal,
      ].some((v) => v !== null),
    "Escribe al menos una medida",
  );

export type MeasurementResult = { ok: true } | { ok: false; error: "no_consent" | "not_found" };

export function recordMeasurement(
  database: Database,
  ctx: Ctx,
  athleteId: string,
  raw: z.input<typeof measurementSchema>,
  today: IsoDate,
): Promise<MeasurementResult> {
  const input = measurementSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [athlete] = await tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.id, athleteId));
    if (!athlete || input.measuredOn > today) return { ok: false, error: "not_found" };
    const [consent] = await tx
      .select()
      .from(bodyConsents)
      .where(and(eq(bodyConsents.athleteId, athleteId), isNull(bodyConsents.revokedAt)));
    if (!consent) return { ok: false, error: "no_consent" };
    await tx
      .insert(bodyMeasurements)
      .values({ schoolId: ctx.schoolId, athleteId, ...input, recordedByUserId: ctx.actorUserId });
    return { ok: true };
  });
}

export function deleteMeasurement(database: Database, ctx: Ctx, measurementId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const deleted = await tx
      .delete(bodyMeasurements)
      .where(eq(bodyMeasurements.id, measurementId))
      .returning();
    return deleted.length > 0;
  });
}
