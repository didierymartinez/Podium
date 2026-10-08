import "server-only";
import { db } from "@/db/client";
import { requireVerifiedUser } from "@/modules/auth/session";
import { canManageSettings } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
  /** Valores normalizados por el servidor para reflejar en el formulario. */
  values?: Record<string, string>;
};

export const FORBIDDEN_STATE: ActionState = {
  ok: false,
  message: "Solo el propietario o un administrador pueden cambiar la configuración.",
};

/** Contexto para server actions de configuración; null si el usuario no puede administrar la escuela. */
export async function getManagerContext(slug: string) {
  const user = await requireVerifiedUser();
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !canManageSettings(member.roles)) return null;
  return { user, school: member.school, ctx: { schoolId: member.school.id, actorUserId: user.id } };
}
