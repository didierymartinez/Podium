"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { canManagePeople, type SchoolRole } from "@/modules/schools/permissions";
import {
  archiveExercise,
  assignPlan,
  createExercise,
  createPlan,
  deletePlan,
  duplicatePlan,
  exerciseSchema,
  planSchema,
  reportSchema,
  saveSessionReport,
  unassignPlan,
  updatePlan,
  type AssignResult,
} from "@/modules/training/training";
import { createPeriod, deletePeriod, periodSchema } from "@/modules/training/periodization";
import { getActionContext } from "../action-context";

const staff = (roles: readonly SchoolRole[]) => canManagePeople(roles) || roles.includes("COACH");
type Fail = { ok: false; message: string };
const FORBIDDEN: Fail = { ok: false, message: "No tienes permiso para esta acción." };

export async function createExerciseAction(slug: string, input: unknown): Promise<{ ok: true } | Fail> {
  const member = await getActionContext(slug, staff);
  if (!member) return FORBIDDEN;
  const parsed = exerciseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  await createExercise(db, member.ctx, parsed.data);
  refresh();
  return { ok: true };
}

export async function archiveExerciseAction(slug: string, exerciseId: string) {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false };
  const ok = await archiveExercise(db, member.ctx, exerciseId, { isManager: canManagePeople(member.roles) });
  refresh();
  return { ok };
}

export async function savePlanAction(
  slug: string,
  planId: string | null,
  input: unknown,
): Promise<Fail | undefined> {
  const member = await getActionContext(slug, staff);
  if (!member) return FORBIDDEN;
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa el plan." };
  if (planId) {
    if (!(await updatePlan(db, member.ctx, planId, parsed.data)))
      return { ok: false, message: "El plan ya no existe." };
  } else await createPlan(db, member.ctx, parsed.data);
  redirect(`/${slug}/entrenamiento`);
}

export async function duplicatePlanAction(slug: string, planId: string) {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false };
  const id = await duplicatePlan(db, member.ctx, planId);
  if (id) redirect(`/${slug}/entrenamiento/planes/${id}`);
  return { ok: false };
}

export async function deletePlanAction(slug: string, planId: string) {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false };
  await deletePlan(db, member.ctx, planId);
  refresh();
  return { ok: true };
}

export async function assignPlanAction(
  slug: string,
  input: { planId: string; groupId: string; dates: string[] },
): Promise<AssignResult | { ok: false; error: "forbidden" }> {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false, error: "forbidden" };
  const result = await assignPlan(db, member.ctx, input, todayIn(member.school.timezone), {
    isManager: canManagePeople(member.roles),
  });
  if (result.ok) refresh();
  return result;
}

export async function unassignPlanAction(slug: string, assignmentId: string) {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false };
  const ok = await unassignPlan(db, member.ctx, assignmentId, { isManager: canManagePeople(member.roles) });
  refresh();
  return { ok };
}

export async function saveSessionReportAction(
  slug: string,
  sessionId: string,
  input: unknown,
): Promise<{ ok: boolean }> {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const ok = await saveSessionReport(db, member.ctx, sessionId, parsed.data, {
    isManager: canManagePeople(member.roles),
  });
  if (ok) refresh();
  return { ok };
}

export async function createPeriodAction(
  slug: string,
  input: unknown,
): Promise<{ ok: boolean; message?: string }> {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const id = await createPeriod(db, member.ctx, parsed.data, { isManager: canManagePeople(member.roles) });
  if (!id) return { ok: false, message: "No puedes planificar este grupo." };
  refresh();
  return { ok: true };
}

export async function deletePeriodAction(slug: string, periodId: string) {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false };
  const ok = await deletePeriod(db, member.ctx, periodId, { isManager: canManagePeople(member.roles) });
  refresh();
  return { ok };
}
