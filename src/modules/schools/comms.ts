import { eq } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, schools } from "@/db/schema";

/**
 * Paso 7 del onboarding: activar (o pausar) las comunicaciones con las familias. Mientras no esté activo,
 * los avisos a familias quedan solo en la app y las mensualidades no se generan solas.
 */
export function setCommsEnabled(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  enabled: boolean,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx
      .update(schools)
      .set({ commsEnabledAt: enabled ? new Date() : null })
      .where(eq(schools.id, ctx.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: enabled ? "school.comms_enabled" : "school.comms_paused",
      entity: "school",
      entityId: ctx.schoolId,
    });
  });
}

export async function commsEnabled(database: Database, schoolId: string) {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx.select({ at: schools.commsEnabledAt }).from(schools).where(eq(schools.id, schoolId)),
  );
  return Boolean(row?.at);
}
