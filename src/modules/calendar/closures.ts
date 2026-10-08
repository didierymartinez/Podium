import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, schoolClosures } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";

export const closureSchema = z
  .object({
    startDate: z.iso.date("Escribe la fecha de inicio"),
    endDate: z.iso.date("Escribe la fecha final"),
    reason: z.string().trim().min(3, "Escribe el motivo (p. ej. vacaciones de fin de año)").max(80),
  })
  .refine((c) => c.endDate >= c.startDate, {
    message: "La fecha final debe ser igual o posterior",
    path: ["endDate"],
  });

export type ClosureInput = z.infer<typeof closureSchema>;
export type Closure = { id: string; startDate: IsoDate; endDate: IsoDate; reason: string };

/** ¿La fecha cae en un día sin clase de la escuela? */
export function closureOn(date: IsoDate, closures: Pick<Closure, "startDate" | "endDate" | "reason">[]) {
  return closures.find((c) => c.startDate <= date && date <= c.endDate);
}

export function listClosures(database: Database, schoolId: string, from?: IsoDate, to?: IsoDate) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        id: schoolClosures.id,
        startDate: schoolClosures.startDate,
        endDate: schoolClosures.endDate,
        reason: schoolClosures.reason,
      })
      .from(schoolClosures)
      .where(
        and(
          to ? lte(schoolClosures.startDate, to) : undefined,
          from ? gte(schoolClosures.endDate, from) : undefined,
        ),
      )
      .orderBy(asc(schoolClosures.startDate)),
  );
}

export function createClosure(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  input: ClosureInput,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .insert(schoolClosures)
      .values({ schoolId: ctx.schoolId, ...input })
      .returning({ id: schoolClosures.id });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "closure.created",
      entity: "school_closure",
      entityId: row.id,
      data: input,
    });
    return row.id;
  });
}

export function deleteClosure(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  closureId: string,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx.delete(schoolClosures).where(eq(schoolClosures.id, closureId)).returning();
    if (row) {
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.actorUserId,
        action: "closure.deleted",
        entity: "school_closure",
        entityId: closureId,
        data: { startDate: row.startDate, endDate: row.endDate, reason: row.reason },
      });
    }
    return Boolean(row);
  });
}
