"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { parseCOP } from "@/lib/money";
import { displayPhone } from "@/lib/phone";
import { createFeePlan, feePlanSchema, setFeePlanActive, updateFeePlan } from "@/modules/billing/fee-plans";
import { billingPolicySchema } from "@/modules/billing/policy";
import { updateBillingPolicy } from "@/modules/billing/settings";
import { attendancePolicySchema, updateAttendancePolicy } from "@/modules/attendance/alerts";
import { closureSchema, createClosure, deleteClosure } from "@/modules/calendar/closures";
import { schoolProfileSchema, updateSchoolProfile } from "@/modules/schools/profile";
import { resyncSessions } from "../asistencia/sync";
import { FORBIDDEN_STATE, getManagerContext, type ActionState } from "./context";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const int = (form: FormData, key: string) => {
  const value = parseCOP(text(form, key));
  return value ?? Number.NaN;
};

export async function updateProfileAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getManagerContext(slug);
  if (!manager) return FORBIDDEN_STATE;

  const parsed = schoolProfileSchema.safeParse({
    name: text(form, "name"),
    legalName: text(form, "legalName"),
    documentType: text(form, "documentType") || null,
    documentNumber: text(form, "documentNumber"),
    phone: text(form, "phone"),
    contactEmail: text(form, "contactEmail"),
    city: text(form, "city"),
    address: text(form, "address"),
    brandColor: text(form, "brandColor"),
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  await updateSchoolProfile(db, manager.ctx, parsed.data);
  refresh();
  return {
    ok: true,
    message: "Perfil guardado",
    values: { documentNumber: parsed.data.documentNumber ?? "", phone: displayPhone(parsed.data.phone) },
  };
}

export async function updateBillingPolicyAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getManagerContext(slug);
  if (!manager) return FORBIDDEN_STATE;

  const adjustment = (prefix: string) => ({
    type: text(form, `${prefix}Type`),
    value: text(form, `${prefix}Type`) === "none" ? 0 : int(form, `${prefix}Value`),
  });

  const parsed = billingPolicySchema.safeParse({
    generationDay: int(form, "generationDay"),
    dueDay: int(form, "dueDay"),
    enrollmentFee: int(form, "enrollmentFee"),
    lateFee: adjustment("lateFee"),
    siblingDiscount: adjustment("siblingDiscount"),
    earlyPayment: { ...adjustment("earlyPayment"), untilDay: int(form, "earlyPaymentUntilDay") },
    midMonthJoin: text(form, "midMonthJoin"),
    overdueAfterDays: int(form, "overdueAfterDays"),
    invoicePrefix: text(form, "invoicePrefix").toUpperCase(),
    receiptPrefix: text(form, "receiptPrefix").toUpperCase(),
    showDebtToCoaches: form.get("showDebtToCoaches") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Revisa los campos marcados",
      errors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  await updateBillingPolicy(db, manager.ctx, parsed.data);
  refresh();
  return { ok: true, message: "Política de cobro guardada" };
}

function parseFeePlan(form: FormData) {
  return feePlanSchema.safeParse({
    name: text(form, "name"),
    description: text(form, "description"),
    monthlyAmount: parseCOP(text(form, "monthlyAmount")) ?? undefined,
  });
}

export async function saveFeePlanAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getManagerContext(slug);
  if (!manager) return FORBIDDEN_STATE;

  const parsed = parseFeePlan(form);
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const id = text(form, "id");
  if (id) {
    const plan = await updateFeePlan(db, manager.ctx, id, parsed.data);
    if (!plan) return { ok: false, message: "La tarifa no existe" };
  } else {
    await createFeePlan(db, manager.ctx, parsed.data);
  }
  refresh();
  return { ok: true, message: id ? "Tarifa actualizada" : "Tarifa creada" };
}

export async function setFeePlanActiveAction(
  slug: string,
  feePlanId: string,
  active: boolean,
): Promise<ActionState> {
  const manager = await getManagerContext(slug);
  if (!manager) return FORBIDDEN_STATE;
  await setFeePlanActive(db, manager.ctx, feePlanId, active);
  refresh();
  return { ok: true };
}

export async function createClosureAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getManagerContext(slug);
  if (!manager) return FORBIDDEN_STATE;
  const parsed = closureSchema.safeParse({
    startDate: text(form, "startDate"),
    endDate: text(form, "endDate") || text(form, "startDate"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  await createClosure(db, manager.ctx, parsed.data);
  await resyncSessions(manager.school);
  refresh();
  return { ok: true, message: "Día sin clase guardado" };
}

export async function deleteClosureAction(slug: string, closureId: string): Promise<ActionState> {
  const manager = await getManagerContext(slug);
  if (!manager) return FORBIDDEN_STATE;
  await deleteClosure(db, manager.ctx, closureId);
  await resyncSessions(manager.school);
  refresh();
  return { ok: true };
}

export async function updateAttendancePolicyAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await getManagerContext(slug);
  if (!manager) return FORBIDDEN_STATE;
  const parsed = attendancePolicySchema.safeParse({
    consecutiveAbsences: Number(text(form, "consecutiveAbsences")),
    minMonthlyRate: Number(text(form, "minMonthlyRate")),
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  await updateAttendancePolicy(db, manager.ctx, parsed.data);
  refresh();
  return { ok: true, message: "Alertas guardadas" };
}
