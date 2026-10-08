"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formReader } from "@/components/form-data";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { normalizeColombianMobile } from "@/lib/phone";
import {
  ATHLETE_ERROR_MESSAGES,
  addGuardianToAthlete,
  changeEnrollmentStatus,
  createAthlete,
  enrollAthlete,
  removeGuardianFromAthlete,
  setPayer,
  updateAthlete,
  type StatusChange,
} from "@/modules/athletes/athletes";
import { WITHDRAWAL_REASON_LABELS, type WithdrawalReason } from "@/modules/athletes/enrollment-status";
import { findGuardianByPhone } from "@/modules/athletes/guardians";
import { clearInjury, reportInjury } from "@/modules/attendance/injuries";
import { chargeEnrollmentFee } from "@/modules/billing/invoices";
import { readBillingPolicy } from "@/modules/billing/policy";
import {
  RELATIONSHIPS,
  athleteSchema,
  enrollmentInputSchema,
  guardianSchema,
} from "@/modules/athletes/schemas";
import { canManagePeople } from "@/modules/schools/permissions";
import { FORBIDDEN_STATE, getActionContext, type ActionState } from "../action-context";

const people = (slug: string) => getActionContext(slug, canManagePeople);

function readAthlete(form: FormData) {
  const f = formReader(form, "athlete.");
  return athleteSchema.safeParse({
    firstName: f.text("firstName"),
    lastName: f.text("lastName"),
    documentType: f.nullable("documentType"),
    documentNumber: f.text("documentNumber"),
    birthDate: f.text("birthDate"),
    sex: f.nullable("sex"),
    phone: f.text("phone"),
    email: f.text("email"),
    healthInsurer: f.text("healthInsurer"),
    bloodType: f.nullable("bloodType"),
    medicalNotes: f.text("medicalNotes"),
    emergencyContactName: f.text("emergencyContactName"),
    emergencyContactPhone: f.text("emergencyContactPhone"),
    schoolName: f.text("schoolName"),
    notes: f.text("notes"),
  });
}

function readGuardian(form: FormData) {
  const f = formReader(form, "guardian.");
  const relationship = z.enum(RELATIONSHIPS).safeParse(f.text("relationship"));
  const guardian = guardianSchema.safeParse({
    firstName: f.text("firstName"),
    lastName: f.text("lastName"),
    documentType: f.nullable("documentType"),
    documentNumber: f.text("documentNumber"),
    phone: f.text("phone"),
    email: f.text("email"),
  });
  return { guardian, relationship: relationship.success ? relationship.data : "GUARDIAN" };
}

function readEnrollment(form: FormData) {
  const f = formReader(form, "enrollment.");
  return enrollmentInputSchema.safeParse({
    groupId: f.text("groupId"),
    feePlanId: f.text("feePlanId"),
    startDate: f.text("startDate"),
    status: f.text("status") || "ACTIVE",
    allowOverCapacity: f.bool("allowOverCapacity"),
  });
}

/** Une errores de varias secciones con prefijo ("guardian.phone"). */
function prefixed(prefix: string, error: z.ZodError) {
  return Object.fromEntries(
    Object.entries(z.flattenError(error).fieldErrors).map(([k, v]) => [`${prefix}${k}`, v as string[]]),
  );
}

export async function createAthleteAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await people(slug);
  if (!manager) return FORBIDDEN_STATE;

  const withGuardian = formReader(form).bool("withGuardian");
  const withEnrollment = formReader(form).bool("withEnrollment");
  const athlete = readAthlete(form);
  const { guardian, relationship } = readGuardian(form);
  const enrollment = readEnrollment(form);

  const errors = {
    ...(athlete.success ? {} : prefixed("athlete.", athlete.error)),
    ...(!withGuardian || guardian.success ? {} : prefixed("guardian.", guardian.error)),
    ...(!withEnrollment || enrollment.success ? {} : prefixed("enrollment.", enrollment.error)),
  };
  if (Object.keys(errors).length > 0 || !athlete.success) {
    return { ok: false, message: "Revisa los campos marcados", errors };
  }

  const result = await createAthlete(db, manager.ctx, {
    athlete: athlete.data,
    guardian: withGuardian && guardian.success ? { ...guardian.data, relationship } : null,
    enrollment: withEnrollment && enrollment.success ? enrollment.data : null,
    today: todayIn(manager.school.timezone),
  });
  if (!result.ok) return { ok: false, code: result.error, message: ATHLETE_ERROR_MESSAGES[result.error] };
  if (result.enrollmentId && enrollment.success && enrollment.data.status === "ACTIVE") {
    await chargeFee(manager, slug, result.enrollmentId);
  }
  redirect(`/${slug}/alumnos/${result.athleteId}`);
}

/** Cobro de matrícula según la política (#36). */
async function chargeFee(
  manager: NonNullable<Awaited<ReturnType<typeof people>>>,
  slug: string,
  enrollmentId: string,
) {
  await chargeEnrollmentFee(
    db,
    { ...manager.ctx, slug },
    enrollmentId,
    todayIn(manager.school.timezone),
    readBillingPolicy(manager.school.settings.billing),
  );
}

export async function updateAthleteAction(
  slug: string,
  athleteId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await people(slug);
  if (!manager) return FORBIDDEN_STATE;
  const athlete = readAthlete(form);
  if (!athlete.success)
    return { ok: false, message: "Revisa los campos marcados", errors: prefixed("athlete.", athlete.error) };
  const result = await updateAthlete(db, manager.ctx, athleteId, athlete.data);
  if (!result.ok) return { ok: false, message: ATHLETE_ERROR_MESSAGES[result.error] };
  redirect(`/${slug}/alumnos/${athleteId}`);
}

export async function enrollAction(
  slug: string,
  athleteId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await people(slug);
  if (!manager) return FORBIDDEN_STATE;
  const enrollment = readEnrollment(form);
  if (!enrollment.success) return { ok: false, errors: prefixed("enrollment.", enrollment.error) };
  const result = await enrollAthlete(db, manager.ctx, athleteId, enrollment.data);
  if (!result.ok) return { ok: false, code: result.error, message: ATHLETE_ERROR_MESSAGES[result.error] };
  if (enrollment.data.status === "ACTIVE") await chargeFee(manager, slug, result.enrollmentId);
  refresh();
  return { ok: true, message: "Matrícula creada" };
}

export async function changeStatusAction(
  slug: string,
  enrollmentId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await people(slug);
  if (!manager) return FORBIDDEN_STATE;
  const f = formReader(form);
  const date = todayIn(manager.school.timezone);
  const notes = f.nullable("notes");
  const to = f.text("to");

  let change: StatusChange;
  if (to === "FROZEN") {
    const frozenUntil = f.nullable("frozenUntil");
    if (frozenUntil && frozenUntil <= date)
      return { ok: false, errors: { frozenUntil: ["Debe ser una fecha futura"] } };
    change = { to, date, frozenUntil, notes };
  } else if (to === "WITHDRAWN") {
    const reason = f.text("reason");
    if (!(reason in WITHDRAWAL_REASON_LABELS))
      return { ok: false, errors: { reason: ["Elige el motivo del retiro"] } };
    change = { to, date, reason: reason as WithdrawalReason, notes };
  } else if (to === "ACTIVE" || to === "DISCARDED") {
    change = to === "ACTIVE" ? { to, date } : { to, date, notes };
  } else {
    return { ok: false, message: "Estado inválido" };
  }

  const result = await changeEnrollmentStatus(db, manager.ctx, enrollmentId, change);
  if (!result.ok) return { ok: false, message: ATHLETE_ERROR_MESSAGES[result.error] };
  // Al activar una preinscripción se cobra la matrícula (una sola vez por matrícula).
  if (change.to === "ACTIVE") await chargeFee(manager, slug, enrollmentId);
  refresh();
  return { ok: true, message: "Matrícula actualizada" };
}

export async function addGuardianAction(
  slug: string,
  athleteId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await people(slug);
  if (!manager) return FORBIDDEN_STATE;
  const { guardian, relationship } = readGuardian(form);
  if (!guardian.success) return { ok: false, errors: prefixed("guardian.", guardian.error) };
  const result = await addGuardianToAthlete(db, manager.ctx, athleteId, {
    ...guardian.data,
    relationship,
    isPayer: formReader(form).bool("isPayer"),
  });
  if (!result.ok) return { ok: false, message: ATHLETE_ERROR_MESSAGES[result.error] };
  refresh();
  return { ok: true, message: "Acudiente agregado" };
}

export async function setPayerAction(
  slug: string,
  athleteId: string,
  guardianId: string,
): Promise<ActionState> {
  const manager = await people(slug);
  if (!manager) return FORBIDDEN_STATE;
  const result = await setPayer(db, manager.ctx, athleteId, guardianId);
  if (!result.ok) return { ok: false, message: ATHLETE_ERROR_MESSAGES[result.error] };
  refresh();
  return { ok: true };
}

export async function removeGuardianAction(
  slug: string,
  athleteId: string,
  guardianId: string,
): Promise<ActionState> {
  const manager = await people(slug);
  if (!manager) return FORBIDDEN_STATE;
  const result = await removeGuardianFromAthlete(db, manager.ctx, athleteId, guardianId);
  if (!result.ok) return { ok: false, message: "No se puede quitar al responsable de pago" };
  refresh();
  return { ok: true };
}

/** Sugiere el acudiente existente cuando se escribe un celular ya registrado (hermanos). */
export async function lookupGuardianAction(slug: string, phone: string) {
  const manager = await people(slug);
  if (!manager) return null;
  const normalized = normalizeColombianMobile(phone);
  if (!normalized) return null;
  const guardian = await findGuardianByPhone(db, manager.ctx.schoolId, normalized);
  return guardian
    ? {
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        documentType: guardian.documentType ?? "",
        documentNumber: guardian.documentNumber ?? "",
        email: guardian.email ?? "",
      }
    : null;
}

export async function addInjuryAction(
  slug: string,
  athleteId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const manager = await people(slug);
  if (!manager) return FORBIDDEN_STATE;
  const f = formReader(form);
  const result = await reportInjury(db, manager.ctx, athleteId, {
    kind: f.text("kind"),
    restriction: f.text("restriction"),
    occurredOn: f.text("occurredOn"),
    clearedOn: f.nullable("clearedOn"),
  });
  if (!result.ok) return { ok: false, message: "Revisa los campos marcados", errors: result.errors };
  refresh();
  return { ok: true, message: "Novedad registrada" };
}

export async function clearInjuryAction(
  slug: string,
  athleteId: string,
  injuryId: string,
): Promise<ActionState> {
  const manager = await people(slug);
  if (!manager) return FORBIDDEN_STATE;
  await clearInjury(db, manager.ctx, injuryId, todayIn(manager.school.timezone));
  refresh();
  return { ok: true };
}
