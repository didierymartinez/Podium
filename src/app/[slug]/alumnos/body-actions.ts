"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { todayIn } from "@/lib/dates";
import {
  assessmentSchema,
  deleteMeasurement,
  grantBodyConsent,
  measurementSchema,
  recordMeasurement,
  revokeBodyConsent,
  saveAssessment,
} from "@/modules/athletes/body";
import { canManagePeople } from "@/modules/schools/permissions";
import { getActionContext } from "../action-context";

type Result = { ok: boolean; message?: string };

export async function saveAssessmentAction(slug: string, athleteId: string, input: unknown): Promise<Result> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const ok = await saveAssessment(db, member.ctx, athleteId, parsed.data);
  refresh();
  return { ok };
}

export async function recordMeasurementAction(
  slug: string,
  athleteId: string,
  input: unknown,
): Promise<Result> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  const parsed = measurementSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa las medidas." };
  const r = await recordMeasurement(db, member.ctx, athleteId, parsed.data, todayIn(member.school.timezone));
  if (!r.ok)
    return {
      ok: false,
      message:
        r.error === "no_consent" ? "Falta el permiso del acudiente." : "Revisa la fecha de la medición.",
    };
  refresh();
  return { ok: true };
}

export async function deleteMeasurementAction(slug: string, measurementId: string): Promise<Result> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return { ok: false };
  const ok = await deleteMeasurement(db, member.ctx, measurementId);
  refresh();
  return { ok };
}

/**
 * Permiso para medidas corporales. La familia lo da o lo retira desde Mis hijos (RLS: solo sus hijos);
 * la escuela registra el que obtuvo en papel o lo retira a pedido de la familia.
 */
export async function setBodyConsentAction(
  slug: string,
  athleteId: string,
  granted: boolean,
): Promise<Result> {
  const member = await getActionContext(slug, () => true, { allowReadOnly: true });
  if (!member) return { ok: false };
  const staff = canManagePeople(member.roles);
  const run = () =>
    granted
      ? grantBodyConsent(
          db,
          member.school.id,
          athleteId,
          member.user.id,
          staff ? "school" : "family",
          new Date(),
        )
      : revokeBodyConsent(db, member.school.id, athleteId, member.user.id, new Date());
  const ok = staff ? await run() : await asPortalUser(member.user.id, run);
  refresh();
  return { ok };
}
