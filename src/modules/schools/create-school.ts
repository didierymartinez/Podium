import { DEFAULT_CONCEPTS } from "@/modules/billing/concepts";
import { DEFAULT_DOCUMENT_TYPES } from "@/modules/documents/documents";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pgErrorCode, runInTenant, type Database } from "@/db/rls";
import {
  ageCategories,
  auditLogs,
  chargeConcepts,
  disciplines,
  documentTypes,
  levels,
  schoolMemberships,
  schools,
  sportTests,
  subscriptions,
  venues,
} from "@/db/schema";
import { DEFAULT_BILLING_POLICY } from "@/modules/billing/policy";
import { ESTIMATED_STUDENTS_OPTIONS } from "./options";
import { SLUG_ERROR_MESSAGES, validateSlug } from "./slug";
import {
  DISCIPLINE_CODES,
  SKATING_AGE_CATEGORIES,
  SKATING_DISCIPLINES,
  levelsFor,
  testsFor,
} from "./sport-template";
import { trialEndsAt } from "./trial";

export const createSchoolSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre de la escuela").max(80),
  slug: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const error = validateSlug(value);
      if (error) ctx.addIssue({ code: "custom", message: SLUG_ERROR_MESSAGES[error] });
    }),
  city: z.string().trim().min(2, "Escribe la ciudad").max(80),
  discipline: z.enum(DISCIPLINE_CODES, "Elige la modalidad principal"),
  estimatedStudents: z.enum(ESTIMATED_STUDENTS_OPTIONS, "Elige un rango de alumnos"),
});

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;

export type CreateSchoolResult =
  { ok: true; schoolId: string; slug: string } | { ok: false; error: "slug_taken" };

/**
 * Crea la escuela en estado de prueba con todo lo necesario para empezar:
 * membresía de propietario, sede, modalidad con niveles, categorías por edad,
 * suscripción en prueba y registro de auditoría. Todo en una transacción.
 */
export async function createSchool(
  database: Database,
  ownerUserId: string,
  input: CreateSchoolInput,
  now: Date = new Date(),
): Promise<CreateSchoolResult> {
  const schoolId = randomUUID();
  const endsAt = trialEndsAt(now);
  const discipline = SKATING_DISCIPLINES.find((d) => d.code === input.discipline)!;

  try {
    await runInTenant(database, { schoolId, userId: ownerUserId }, async (tx) => {
      await tx.insert(schools).values({
        id: schoolId,
        slug: input.slug,
        name: input.name,
        city: input.city,
        ownerUserId,
        estimatedStudents: input.estimatedStudents,
        status: "TRIAL",
        trialEndsAt: endsAt,
        settings: { billing: DEFAULT_BILLING_POLICY },
      });

      await tx.insert(schoolMemberships).values({
        schoolId,
        userId: ownerUserId,
        roles: ["OWNER"],
      });

      await tx.insert(venues).values({ schoolId, name: "Sede principal" });

      const [createdDiscipline] = await tx
        .insert(disciplines)
        .values({ schoolId, sport: "SKATING", code: discipline.code, name: discipline.name })
        .returning({ id: disciplines.id });

      await tx.insert(levels).values(
        levelsFor(discipline.code).map((level, i) => ({
          schoolId,
          disciplineId: createdDiscipline.id,
          name: level.name,
          goal: level.goal,
          position: i + 1,
        })),
      );

      await tx.insert(sportTests).values(
        testsFor(discipline.code).map((t, i) => ({
          schoolId,
          disciplineId: t.common ? null : createdDiscipline.id,
          name: t.name,
          kind: t.kind,
          unit: t.unit,
          lowerIsBetter: t.lowerIsBetter,
          context: t.context,
          position: i + 1,
        })),
      );

      await tx
        .insert(ageCategories)
        .values(SKATING_AGE_CATEGORIES.map((category, i) => ({ schoolId, ...category, position: i + 1 })));

      await tx.insert(documentTypes).values(DEFAULT_DOCUMENT_TYPES.map((t) => ({ schoolId, ...t })));
      await tx.insert(chargeConcepts).values(DEFAULT_CONCEPTS.map((name) => ({ schoolId, name })));

      await tx.insert(subscriptions).values({
        schoolId,
        planCode: "trial",
        status: "TRIALING",
        trialEndsAt: endsAt,
      });

      await tx.insert(auditLogs).values({
        schoolId,
        actorUserId: ownerUserId,
        action: "school.created",
        entity: "school",
        entityId: schoolId,
        data: { slug: input.slug, discipline: discipline.code },
      });
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") return { ok: false, error: "slug_taken" };
    throw err;
  }

  return { ok: true, schoolId, slug: input.slug };
}
