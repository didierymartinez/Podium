"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { formReader } from "@/components/form-data";
import {
  InvalidReferenceError,
  createGroup,
  groupSchema,
  setGroupActive,
  updateGroup,
} from "@/modules/groups/groups";
import { canManagePeople } from "@/modules/schools/permissions";
import { FORBIDDEN_STATE, getActionContext, type ActionState } from "../action-context";
import { resyncSessions } from "../asistencia/sync";

export async function saveGroupAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return FORBIDDEN_STATE;
  const f = formReader(form);

  let schedule: unknown = [];
  let assistantCoachIds: unknown = [];
  try {
    schedule = JSON.parse(f.text("schedule") || "[]");
    assistantCoachIds = JSON.parse(f.text("assistantCoachIds") || "[]");
  } catch {
    return { ok: false, errors: { schedule: ["Horario inválido"] } };
  }

  const parsed = groupSchema.safeParse({
    name: f.text("name"),
    disciplineId: f.text("disciplineId"),
    levelId: f.nullable("levelId"),
    capacity: f.int("capacity"),
    defaultFeePlanId: f.nullable("defaultFeePlanId"),
    color: f.text("color"),
    schedule,
    headCoachId: f.nullable("headCoachId"),
    assistantCoachIds,
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    // Errores de horario anidados ("schedule.0") se muestran juntos.
    const scheduleIssue = parsed.error.issues.find((i) => i.path[0] === "schedule");
    return {
      ok: false,
      errors: { ...errors, schedule: scheduleIssue ? [scheduleIssue.message] : undefined },
    };
  }

  const id = f.text("id");
  try {
    if (id) {
      if (!(await updateGroup(db, manager.ctx, id, parsed.data)))
        return { ok: false, message: "El grupo no existe" };
    } else {
      await createGroup(db, manager.ctx, parsed.data);
    }
  } catch (err) {
    if (err instanceof InvalidReferenceError) return { ok: false, message: err.message };
    throw err;
  }
  await resyncSessions(manager.school);
  redirect(`/${slug}/grupos`);
}

export async function setGroupActiveAction(
  slug: string,
  groupId: string,
  active: boolean,
): Promise<ActionState> {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return FORBIDDEN_STATE;
  await setGroupActive(db, manager.ctx, groupId, active);
  await resyncSessions(manager.school);
  refresh();
  return { ok: true };
}
