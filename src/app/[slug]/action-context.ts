import "server-only";
import { db } from "@/db/client";
import { requireVerifiedUser } from "@/modules/auth/session";
import type { SchoolRole } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";
import { isWritable } from "@/modules/subscription/subscription";

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

/**
 * Contexto para server actions de una escuela; null si el usuario no tiene el permiso pedido.
 * En solo lectura, cancelada o suspendida (#21) tampoco se permite escribir, salvo `allowReadOnly`
 * (pagos de las familias y datos personales, que nunca se bloquean).
 */
export async function getActionContext(
  slug: string,
  allowed: (roles: readonly SchoolRole[]) => boolean,
  opts: { allowReadOnly?: boolean } = {},
) {
  const user = await requireVerifiedUser();
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !allowed(member.roles)) return null;
  if (!opts.allowReadOnly && !isWritable(member.school)) return null;
  return {
    user,
    school: member.school,
    roles: member.roles,
    ctx: { schoolId: member.school.id, actorUserId: user.id },
  };
}
