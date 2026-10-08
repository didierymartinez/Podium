"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { reportExcuse, sendExcuseNotice, withdrawExcuse } from "@/modules/attendance/family";
import { getActionContext, type ActionState } from "../action-context";

const ERRORS = {
  not_found: "No encontramos esa clase.",
  started: "La clase ya empezó: avisa directamente al profesor.",
  recorded: "La escuela ya tomó la asistencia de esa clase.",
  not_in_roster: "Tu hijo(a) no está en esa clase.",
} as const;

/** El acudiente avisa que su hijo(a) no asistirá (DEP-23). Nunca se bloquea por el estado de la suscripción. */
export async function reportExcuseAction(
  slug: string,
  input: { sessionId: string; athleteId: string; reason: string },
): Promise<ActionState> {
  const member = await getActionContext(slug, () => true, { allowReadOnly: true });
  if (!member) return { ok: false, message: "Inicia sesión de nuevo." };
  if (input.reason.trim().length < 3) return { ok: false, message: "Cuéntanos el motivo." };
  const ctx = {
    schoolId: member.school.id,
    userId: member.user.id,
    timeZone: member.school.timezone,
    slug,
  };
  const result = await asPortalUser(member.user.id, () => reportExcuse(db, ctx, input, new Date()));
  if (!result.ok) return { ok: false, message: ERRORS[result.error] };
  await sendExcuseNotice(db, member.school.id, result.notice);
  refresh();
  return { ok: true, message: "Le avisamos al profesor" };
}

export async function withdrawExcuseAction(
  slug: string,
  input: { sessionId: string; athleteId: string },
): Promise<ActionState> {
  const member = await getActionContext(slug, () => true, { allowReadOnly: true });
  if (!member) return { ok: false, message: "Inicia sesión de nuevo." };
  const ok = await asPortalUser(member.user.id, () =>
    withdrawExcuse(
      db,
      { schoolId: member.school.id, userId: member.user.id, timeZone: member.school.timezone },
      input,
      new Date(),
    ),
  );
  refresh();
  return ok ? { ok: true } : { ok: false, message: "Ya no se puede retirar el aviso." };
}
