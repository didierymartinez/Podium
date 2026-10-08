import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { athletes, auditLogs, injuries } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";

/** Novedades médicas y lesiones (DEP-72). */

export const injurySchema = z
  .object({
    kind: z.string().trim().min(3, "Escribe la novedad").max(80),
    occurredOn: z.iso.date("Escribe la fecha"),
    restriction: z.string().trim().min(3, "Escribe la restricción").max(160),
    clearedOn: z.iso.date().nullable().default(null),
  })
  .refine((i) => !i.clearedOn || i.clearedOn >= i.occurredOn, {
    path: ["clearedOn"],
    message: "El alta no puede ser antes de la novedad",
  });

type Ctx = { schoolId: string; actorUserId: string };

export async function reportInjury(
  database: Database,
  ctx: Ctx,
  athleteId: string,
  raw: z.input<typeof injurySchema>,
) {
  const parsed = injurySchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, errors: z.flattenError(parsed.error).fieldErrors };
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [athlete] = await tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.id, athleteId));
    if (!athlete) return { ok: false as const, errors: { kind: ["Alumno no encontrado"] } };
    const [created] = await tx
      .insert(injuries)
      .values({ schoolId: ctx.schoolId, athleteId, ...parsed.data, reportedByUserId: ctx.actorUserId })
      .returning({ id: injuries.id });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "injury.reported",
      entity: "athlete",
      entityId: athleteId,
      data: { injuryId: created.id },
    });
    return { ok: true as const, id: created.id };
  });
}

export function clearInjury(database: Database, ctx: Ctx, injuryId: string, on: IsoDate) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .update(injuries)
      .set({ clearedOn: on })
      .where(eq(injuries.id, injuryId))
      .returning({ athleteId: injuries.athleteId });
    if (!row) return false;
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "injury.cleared",
      entity: "athlete",
      entityId: row.athleteId,
      data: { injuryId, on },
    });
    return true;
  });
}

export function listInjuries(database: Database, schoolId: string, athleteId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx.select().from(injuries).where(eq(injuries.athleteId, athleteId)).orderBy(desc(injuries.occurredOn)),
  );
}

/** Restricciones vigentes en una fecha: desde la novedad hasta el día anterior al alta. */
export async function activeRestrictions(tx: Tx, athleteIds: string[], on: IsoDate) {
  const result = new Map<string, string[]>();
  if (athleteIds.length === 0) return result;
  const rows = await tx
    .select({ athleteId: injuries.athleteId, kind: injuries.kind, restriction: injuries.restriction })
    .from(injuries)
    .where(
      and(
        inArray(injuries.athleteId, athleteIds),
        lte(injuries.occurredOn, on),
        or(isNull(injuries.clearedOn), gt(injuries.clearedOn, on)),
      ),
    );
  for (const r of rows)
    result.set(r.athleteId, [...(result.get(r.athleteId) ?? []), `${r.kind}: ${r.restriction}`]);
  return result;
}
