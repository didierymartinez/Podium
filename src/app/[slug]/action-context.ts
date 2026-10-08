import "server-only";
import { db } from "@/db/client";
import { requireVerifiedUser } from "@/modules/auth/session";
import type { SchoolRole } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
  /** Valores normalizados por el servidor para reflejar en el formulario. */
  values?: Record<string, string>;
  /** Código de error de dominio (p. ej. "group_full") para que el formulario reaccione. */
  code?: string;
};

export const FORBIDDEN_STATE: ActionState = { ok: false, message: "No tienes permiso para esta acción." };

/** Contexto para server actions de una escuela; null si el usuario no tiene el permiso pedido. */
export async function getActionContext(slug: string, allowed: (roles: readonly SchoolRole[]) => boolean) {
  const user = await requireVerifiedUser();
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !allowed(member.roles)) return null;
  return {
    user,
    school: member.school,
    roles: member.roles,
    ctx: { schoolId: member.school.id, actorUserId: user.id },
  };
}
