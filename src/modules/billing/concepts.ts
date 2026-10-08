import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { pgErrorCode, runInTenant, type Database } from "@/db/rls";
import { auditLogs, chargeConcepts } from "@/db/schema";

/** Conceptos sugeridos al crear una escuela (Configuración → Cobros). */
export const DEFAULT_CONCEPTS = ["Uniforme", "Inscripción a competencia", "Evento o salida"];

export const conceptSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre").max(60),
  defaultAmount: z.number().int().min(1, "Debe ser mayor a cero").max(50_000_000).nullable(),
});

export function listConcepts(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx.select().from(chargeConcepts).orderBy(asc(chargeConcepts.name)),
  );
}

export async function saveConcept(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  raw: z.input<typeof conceptSchema>,
  id?: string,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string[] | undefined> }> {
  const parsed = conceptSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  try {
    await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      if (id) await tx.update(chargeConcepts).set(parsed.data).where(eq(chargeConcepts.id, id));
      else await tx.insert(chargeConcepts).values({ schoolId: ctx.schoolId, ...parsed.data });
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.actorUserId,
        action: id ? "charge_concept.updated" : "charge_concept.created",
        entity: "school",
        entityId: ctx.schoolId,
        data: parsed.data,
      });
    });
    return { ok: true };
  } catch (err) {
    if (pgErrorCode(err) === "23505")
      return { ok: false, errors: { name: ["Ya existe un concepto con ese nombre"] } };
    throw err;
  }
}

export function setConceptActive(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  id: string,
  active: boolean,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, (tx) =>
    tx.update(chargeConcepts).set({ active }).where(eq(chargeConcepts.id, id)),
  );
}
