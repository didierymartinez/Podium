"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { saveAttendance, type SaveAttendanceResult } from "@/modules/attendance/attendance";
import { cancelSchema, cancelSession, restoreSession } from "@/modules/attendance/sessions";
import { canManagePeople, type SchoolRole } from "@/modules/schools/permissions";
import { FORBIDDEN_STATE, getActionContext, type ActionState } from "../action-context";

const canTakeAttendance = (roles: readonly SchoolRole[]) => canManagePeople(roles) || roles.includes("COACH");

const SAVE_ERRORS: Record<Exclude<SaveAttendanceResult, { ok: true }>["error"], string> = {
  not_found: "La clase no existe.",
  canceled: "La clase está cancelada.",
  not_coach: "Solo los profesores del grupo pueden tomar esta asistencia.",
  too_early: "La asistencia se abre 1 hora antes de la clase.",
  window_closed: "Pasaron más de 48 horas: pide a la administración que la corrija.",
  not_in_roster: "Hay alumnos que no pertenecen a este grupo. Recarga la página.",
};

export async function saveAttendanceAction(
  slug: string,
  sessionId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const member = await getActionContext(slug, canTakeAttendance);
  if (!member) return FORBIDDEN_STATE;
  let entries: unknown;
  try {
    entries = JSON.parse(String(form.get("entries") ?? "[]"));
  } catch {
    return { ok: false, message: "Datos inválidos" };
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, message: "Marca la asistencia de al menos un alumno." };
  }
  const result = await saveAttendance(
    db,
    { ...member.ctx, timeZone: member.school.timezone, isManager: canManagePeople(member.roles) },
    sessionId,
    { entries: entries as never },
  );
  if (!result.ok) return { ok: false, message: SAVE_ERRORS[result.error] };
  refresh();
  return { ok: true, message: `Asistencia guardada (${result.saved})` };
}

export async function cancelSessionAction(
  slug: string,
  sessionId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return FORBIDDEN_STATE;
  const parsed = cancelSchema.safeParse({ reason: String(form.get("reason") ?? "") });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  await cancelSession(db, manager.ctx, sessionId, parsed.data.reason);
  refresh();
  return { ok: true, message: "Clase cancelada" };
}

export async function restoreSessionAction(slug: string, sessionId: string): Promise<ActionState> {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return FORBIDDEN_STATE;
  await restoreSession(db, manager.ctx, sessionId);
  refresh();
  return { ok: true, message: "Clase restablecida" };
}
