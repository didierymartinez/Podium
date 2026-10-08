import "server-only";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { runInTenant } from "@/db/rls";
import { schools } from "@/db/schema";
import { serverEnv } from "@/env";
import { hasConsoleAccess, requireVerifiedUser, type CurrentUser } from "@/modules/auth/session";
import { SUPPORT_COOKIE, verifySupportToken } from "@/modules/auth/session-token";
import type { SchoolRole } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

export type SupportSession = { reason: string; expiresAt: Date };

/** "Entrar como" de un super admin (#17): ve la escuela como propietario, en solo lectura. */
async function supportAccess(user: CurrentUser, slug: string) {
  if (!hasConsoleAccess(user)) return null;
  const token = (await cookies()).get(SUPPORT_COOKIE)?.value;
  const support = token ? await verifySupportToken(token, serverEnv().SESSION_SECRET) : null;
  if (!support || support.adminUserId !== user.id) return null;
  const [row] = await db.execute<{ id: string | null }>(sql`select school_id_by_slug(${slug}) as id`);
  if (!row?.id || row.id !== support.schoolId) return null;
  const [school] = await runInTenant(db, { schoolId: support.schoolId }, (tx) =>
    tx.select().from(schools).where(eq(schools.id, support.schoolId)),
  );
  return school ? { school, support: { reason: support.reason, expiresAt: support.expiresAt } } : null;
}

/** Escuela actual + roles del usuario; 404 si no es miembro (no revela si existe). */
export const getSchoolContext = cache(async (slug: string) => {
  const user = await requireVerifiedUser();
  const member = await getMemberSchool(db, slug, user.id);
  if (member)
    return { user, school: member.school, roles: member.roles, support: null as SupportSession | null };
  const access = await supportAccess(user, slug);
  if (!access) notFound();
  // Las acciones usan la membresía real, así que en este modo nada se puede guardar.
  return { user, school: access.school, roles: ["OWNER"] as SchoolRole[], support: access.support };
});
