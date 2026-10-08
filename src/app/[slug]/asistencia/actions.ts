"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { getSessionDetail, saveAttendance, type SaveAttendanceResult } from "@/modules/attendance/attendance";
import { addMakeup, removeMakeup } from "@/modules/attendance/family";
import { reportInjury } from "@/modules/attendance/injuries";
import {
  createExtraSession,
  extraSessionSchema,
  notifyCancellation,
  rescheduleSchema,
  rescheduleSession,
  setSubstitute,
} from "@/modules/attendance/changes";
import { cancelSchema, cancelSession, restoreSession } from "@/modules/attendance/sessions";
import { redirect } from "next/navigation";
import { canManagePeople, type SchoolRole } from "@/modules/schools/permissions";
import { deliverSoon } from "../../deliver";
import { FORBIDDEN_STATE, getActionContext, type ActionState } from "../action-context";

const canTakeAttendance = (roles: readonly SchoolRole[]) => canManagePeople(roles) || roles.includes("COACH");

const SAVE_ERRORS: Record<Exclude<SaveAttendanceResult, { ok: true }>["error"], string> = {
  not_found: "La clase no existe.",
  canceled: "La clase está cancelada.",
  not_coach: "Solo los profesores del grupo pueden tomar esta asistencia.",
  too_early: "La asistencia se abre 1 hora antes de la clase.",
  window_closed: "Pasaron más de 48 horas: pide a la administración que la corrija.",
  not_in_roster: "Hay alumnos que no pertenecen a este grupo. Recarga la página.",
  stale: "La marca guardada sin conexión es muy antigua o tiene una hora inválida.",
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
  const recordedAt = String(form.get("recordedAt") ?? "");
  const result = await saveAttendance(
    db,
    { ...member.ctx, timeZone: member.school.timezone, isManager: canManagePeople(member.roles) },
    sessionId,
    { entries: entries as never, ...(recordedAt ? { recordedAt } : {}) },
  );
  if (!result.ok) return { ok: false, message: SAVE_ERRORS[result.error], code: result.error };
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
  if (await cancelSession(db, manager.ctx, sessionId, parsed.data.reason)) {
    await notifyCancellation(db, { ...manager.ctx, slug }, sessionId);
    deliverSoon(manager.school.id);
  }
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

const CHANGE_ERRORS = {
  not_found: "La clase no existe.",
  canceled: "La clase ya está cancelada.",
  slot_taken: "El grupo ya tiene una clase en esa fecha y hora.",
  invalid_reference: "El grupo o algún alumno no pertenece a la escuela.",
} as const;

export async function rescheduleAction(
  slug: string,
  sessionId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return FORBIDDEN_STATE;
  const parsed = rescheduleSchema.safeParse({
    date: String(form.get("date") ?? ""),
    startTime: String(form.get("startTime") ?? ""),
    endTime: String(form.get("endTime") ?? ""),
    reason: String(form.get("reason") ?? "") || null,
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  const result = await rescheduleSession(db, { ...manager.ctx, slug }, sessionId, parsed.data);
  if (!result.ok) return { ok: false, message: CHANGE_ERRORS[result.error] };
  deliverSoon(manager.school.id);
  redirect(`/${slug}/asistencia/${result.sessionId}`);
}

export async function extraSessionAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return FORBIDDEN_STATE;
  const parsed = extraSessionSchema.safeParse({
    groupId: String(form.get("groupId") ?? ""),
    date: String(form.get("date") ?? ""),
    startTime: String(form.get("startTime") ?? ""),
    endTime: String(form.get("endTime") ?? ""),
    note: String(form.get("note") ?? "").trim() || null,
    athleteIds: form.getAll("athleteIds").map(String),
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  const result = await createExtraSession(db, { ...manager.ctx, slug }, parsed.data);
  if (!result.ok) return { ok: false, message: CHANGE_ERRORS[result.error] };
  deliverSoon(manager.school.id);
  redirect(`/${slug}/asistencia/${result.sessionId}`);
}

export async function setSubstituteAction(slug: string, sessionId: string, coachId: string | null) {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return FORBIDDEN_STATE;
  const ok = await setSubstitute(db, { ...manager.ctx, slug }, sessionId, coachId);
  deliverSoon(manager.school.id);
  refresh();
  return ok
    ? { ok: true, message: coachId ? "Sustituto asignado" : "Sustituto quitado" }
    : { ok: false, message: "No se pudo asignar" };
}

/** Profesor de la clase o administración (para reposiciones y novedades médicas). */
async function sessionStaff(slug: string, sessionId: string) {
  const member = await getActionContext(slug, canTakeAttendance);
  if (!member) return null;
  const detail = await getSessionDetail(
    db,
    { schoolId: member.school.id, userId: member.user.id },
    sessionId,
  );
  if (!detail || (!canManagePeople(member.roles) && !detail.isGroupCoach)) return null;
  return { member, detail };
}

export async function addMakeupAction(
  slug: string,
  sessionId: string,
  athleteId: string,
): Promise<ActionState> {
  const staff = await sessionStaff(slug, sessionId);
  if (!staff) return FORBIDDEN_STATE;
  const ok = await addMakeup(db, staff.member.ctx, sessionId, athleteId);
  if (!ok) return { ok: false, message: "No se pudo agregar: el alumno debe tener una matrícula activa." };
  refresh();
  return { ok: true, message: "Reposición agregada" };
}

export async function removeMakeupAction(
  slug: string,
  sessionId: string,
  athleteId: string,
): Promise<ActionState> {
  const staff = await sessionStaff(slug, sessionId);
  if (!staff) return FORBIDDEN_STATE;
  const ok = await removeMakeup(db, staff.member.ctx, sessionId, athleteId);
  if (!ok) return { ok: false, message: "Ya tiene asistencia registrada en esta clase." };
  refresh();
  return { ok: true };
}

export async function reportInjuryAction(
  slug: string,
  sessionId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await sessionStaff(slug, sessionId);
  if (!staff) return FORBIDDEN_STATE;
  const athleteId = String(form.get("athleteId") ?? "");
  if (!staff.detail.roster.some((r) => r.athleteId === athleteId))
    return { ok: false, errors: { athleteId: ["Elige un alumno de la clase"] } };
  const result = await reportInjury(db, staff.member.ctx, athleteId, {
    kind: String(form.get("kind") ?? ""),
    occurredOn: String(form.get("occurredOn") ?? ""),
    restriction: String(form.get("restriction") ?? ""),
  });
  if (!result.ok) return { ok: false, message: "Revisa los campos marcados", errors: result.errors };
  refresh();
  return { ok: true, message: "Novedad registrada" };
}
