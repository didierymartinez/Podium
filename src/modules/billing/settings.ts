import { eq, sql } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, schools } from "@/db/schema";
import type { BillingPolicy } from "./policy";

/** Guarda la política de cobro en `schools.settings.billing` (sin tocar el resto de settings). */
export async function updateBillingPolicy(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  policy: BillingPolicy,
) {
  await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx
      .update(schools)
      .set({ settings: sql`jsonb_set(${schools.settings}, '{billing}', ${JSON.stringify(policy)}::jsonb)` })
      .where(eq(schools.id, ctx.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "billing.policy_updated",
      entity: "school",
      entityId: ctx.schoolId,
      data: policy,
    });
  });
}
