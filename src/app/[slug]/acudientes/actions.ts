"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formReader } from "@/components/form-data";
import { db } from "@/db/client";
import { displayPhone } from "@/lib/phone";
import { updateGuardian } from "@/modules/athletes/guardians";
import { guardianSchema } from "@/modules/athletes/schemas";
import { canManagePeople } from "@/modules/schools/permissions";
import { FORBIDDEN_STATE, getActionContext, type ActionState } from "../action-context";

export async function updateGuardianAction(
  slug: string,
  guardianId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return FORBIDDEN_STATE;
  const f = formReader(form);
  const parsed = guardianSchema.safeParse({
    firstName: f.text("firstName"),
    lastName: f.text("lastName"),
    documentType: f.nullable("documentType"),
    documentNumber: f.text("documentNumber"),
    phone: f.text("phone"),
    email: f.text("email"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Revisa los campos marcados",
      errors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const result = await updateGuardian(db, manager.ctx, guardianId, parsed.data);
  if (!result.ok) {
    return result.error === "phone_taken"
      ? { ok: false, errors: { phone: ["Ya hay otro acudiente con ese celular en la escuela"] } }
      : { ok: false, message: "El acudiente no existe" };
  }
  refresh();
  return { ok: true, message: "Datos guardados", values: { phone: displayPhone(parsed.data.phone) } };
}
