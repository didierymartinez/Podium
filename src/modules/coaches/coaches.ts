import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { pgErrorCode, runInTenant, type Database } from "@/db/rls";
import { auditLogs, coaches, groupCoaches, groups } from "@/db/schema";
import { normalizeColombianMobile } from "@/lib/phone";
import { PERSON_DOCUMENT_TYPES } from "@/modules/athletes/schemas";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export const coachSchema = z
  .object({
    firstName: z.string().trim().min(2, "Escribe los nombres").max(60),
    lastName: z.string().trim().min(2, "Escribe los apellidos").max(60),
    documentType: z.enum(PERSON_DOCUMENT_TYPES).nullable(),
    documentNumber: optional(20),
    phone: z.string().trim(),
    email: optional(120),
    specialty: optional(80),
    hiredOn: z.union([z.literal(""), z.iso.date()]).transform((v) => v || null),
  })
  .transform((value, ctx) => {
    const phone = normalizeColombianMobile(value.phone);
    if (!phone)
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Escribe un celular colombiano válido" });
    if (value.email && !z.email().safeParse(value.email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "El email no es válido" });
    }
    const documentNumber = value.documentNumber
      ? value.documentNumber.replace(/[^0-9a-z]/gi, "").toUpperCase()
      : null;
    return {
      ...value,
      phone: phone ?? value.phone,
      documentNumber,
      documentType: documentNumber ? value.documentType : null,
    };
  });

export type CoachInput = z.output<typeof coachSchema>;
type Ctx = { schoolId: string; actorUserId: string };

export type CoachResult = { ok: true; coachId: string } | { ok: false; error: "phone_taken" | "not_found" };

export function createCoach(database: Database, ctx: Ctx, input: CoachInput): Promise<CoachResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [coach] = await tx
      .insert(coaches)
      .values({ schoolId: ctx.schoolId, ...input })
      .returning({ id: coaches.id });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "coach.created",
      entity: "coach",
      entityId: coach.id,
    });
    return { ok: true as const, coachId: coach.id };
  }).catch((err) => {
    if (pgErrorCode(err) === "23505") return { ok: false as const, error: "phone_taken" as const };
    throw err;
  });
}

export function updateCoach(
  database: Database,
  ctx: Ctx,
  coachId: string,
  input: CoachInput,
): Promise<CoachResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [coach] = await tx
      .update(coaches)
      .set(input)
      .where(eq(coaches.id, coachId))
      .returning({ id: coaches.id });
    if (!coach) return { ok: false as const, error: "not_found" as const };
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "coach.updated",
      entity: "coach",
      entityId: coachId,
    });
    return { ok: true as const, coachId };
  }).catch((err) => {
    if (pgErrorCode(err) === "23505") return { ok: false as const, error: "phone_taken" as const };
    throw err;
  });
}

export function setCoachActive(database: Database, ctx: Ctx, coachId: string, active: boolean) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [coach] = await tx.update(coaches).set({ active }).where(eq(coaches.id, coachId)).returning();
    if (coach) {
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.actorUserId,
        action: active ? "coach.activated" : "coach.deactivated",
        entity: "coach",
        entityId: coachId,
      });
    }
    return Boolean(coach);
  });
}

export type CoachListItem = typeof coaches.$inferSelect & {
  groups: { id: string; name: string; color: string; role: "HEAD" | "ASSISTANT" }[];
};

export function listCoaches(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx): Promise<CoachListItem[]> => {
    const rows = await tx.select().from(coaches).orderBy(asc(coaches.firstName), asc(coaches.lastName));
    if (rows.length === 0) return [];
    const assignments = await tx
      .select({
        coachId: groupCoaches.coachId,
        role: groupCoaches.role,
        id: groups.id,
        name: groups.name,
        color: groups.color,
      })
      .from(groupCoaches)
      .innerJoin(groups, eq(groups.id, groupCoaches.groupId))
      .where(
        and(
          inArray(
            groupCoaches.coachId,
            rows.map((r) => r.id),
          ),
          eq(groups.active, true),
        ),
      );
    return rows
      .map((c) => ({
        ...c,
        groups: assignments
          .filter((a) => a.coachId === c.id)
          .map(({ id, name, color, role }) => ({ id, name, color, role })),
      }))
      .sort((a, b) => Number(b.active) - Number(a.active));
  });
}

export async function getCoach(database: Database, schoolId: string, coachId: string) {
  const all = await listCoaches(database, schoolId);
  return all.find((c) => c.id === coachId) ?? null;
}
