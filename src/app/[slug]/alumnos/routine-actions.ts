"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { todayIn } from "@/lib/dates";
import { canManagePeople, type SchoolRole } from "@/modules/schools/permissions";
import { logWorkout, routineSchema, saveRoutine, workoutSchema } from "@/modules/training/routines";
import { getActionContext } from "../action-context";

type Result = { ok: boolean; message?: string };
const staff = (roles: readonly SchoolRole[]) => canManagePeople(roles) || roles.includes("COACH");

export async function saveRoutineAction(slug: string, athleteId: string, input: unknown): Promise<Result> {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  const parsed = routineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa la rutina." };
  const id = await saveRoutine(db, member.ctx, athleteId, parsed.data);
  refresh();
  return id ? { ok: true, message: "Rutina guardada." } : { ok: false, message: "El alumno no existe." };
}

/** El profesor registra desde la ficha; la familia (o el alumno) desde su portal, solo para sus hijos. */
export async function logWorkoutAction(slug: string, athleteId: string, input: unknown): Promise<Result> {
  const member = await getActionContext(slug, () => true, { allowReadOnly: true });
  if (!member) return { ok: false, message: "Inicia sesión de nuevo." };
  const parsed = workoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa el entreno." };
  const isStaff = staff(member.roles);
  const today = todayIn(member.school.timezone);
  const run = () => logWorkout(db, member.ctx, athleteId, parsed.data, { today, byFamily: !isStaff });
  const id = isStaff ? await run() : await asPortalUser(member.user.id, run);
  refresh();
  return id
    ? { ok: true, message: "Entreno registrado." }
    : { ok: false, message: "Revisa la fecha del entreno." };
}
