"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formReader } from "@/components/form-data";
import { db } from "@/db/client";
import { coachSchema, createCoach, setCoachActive, updateCoach } from "@/modules/coaches/coaches";
import { canManageSettings } from "@/modules/schools/permissions";
import { FORBIDDEN_STATE, getActionContext, type ActionState } from "../action-context";

export async function saveCoachAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getActionContext(slug, canManageSettings);
  if (!manager) return FORBIDDEN_STATE;
  const f = formReader(form);
  const parsed = coachSchema.safeParse({
    firstName: f.text("firstName"),
    lastName: f.text("lastName"),
    documentType: f.nullable("documentType"),
    documentNumber: f.text("documentNumber"),
    phone: f.text("phone"),
    email: f.text("email"),
    specialty: f.text("specialty"),
    hiredOn: f.text("hiredOn"),
  });
  if (!parsed.success)
    return {
      ok: false,
      message: "Revisa los campos marcados",
      errors: z.flattenError(parsed.error).fieldErrors,
    };

  const id = f.text("id");
  const result = id
    ? await updateCoach(db, manager.ctx, id, parsed.data)
    : await createCoach(db, manager.ctx, parsed.data);
  if (!result.ok) {
    return result.error === "phone_taken"
      ? { ok: false, errors: { phone: ["Ya hay un profesor con ese celular"] } }
      : { ok: false, message: "El profesor no existe" };
  }
  redirect(`/${slug}/profesores/${result.coachId}`);
}

export async function setCoachActiveAction(
  slug: string,
  coachId: string,
  active: boolean,
): Promise<ActionState> {
  const manager = await getActionContext(slug, canManageSettings);
  if (!manager) return FORBIDDEN_STATE;
  await setCoachActive(db, manager.ctx, coachId, active);
  refresh();
  return { ok: true };
}
