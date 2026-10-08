import { db } from "@/db/client";
import { runInTenant } from "@/db/rls";
import { auditLogs } from "@/db/schema";
import { todayIn } from "@/lib/dates";
import { getCurrentUser } from "@/modules/auth/session";
import { fullExport } from "@/modules/reports/full-export";
import { canManageSettings } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

/** Exportación completa de la escuela en ZIP (ADM-75). Solo propietario y administradores; queda auditada. */
export async function GET(_request: Request, ctx: RouteContext<"/[slug]/reportes/exportar-todo">) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !canManageSettings(member.roles)) return new Response(null, { status: 404 });
  const zip = await fullExport(db, member.school.id, new Date());
  await runInTenant(db, { schoolId: member.school.id }, (tx) =>
    tx.insert(auditLogs).values({
      schoolId: member.school.id,
      actorUserId: user.id,
      action: "school.exported",
      entity: "school",
      entityId: member.school.id,
      data: { bytes: zip.length },
    }),
  );
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="podium-${slug}-${todayIn(member.school.timezone)}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
