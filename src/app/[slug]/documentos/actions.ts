"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formReader } from "@/components/form-data";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { storage } from "@/lib/storage";
import { addCertification, certificationSchema, removeCertification } from "@/modules/coaches/certifications";
import {
  DuplicateDocumentTypeError,
  documentTypeSchema,
  recordDocument,
  recordDocumentSchema,
  removeDocument,
  saveDocumentType,
  setDocumentTypeActive,
  setImageConsent,
} from "@/modules/documents/documents";
import { canManagePeople, canManageSettings } from "@/modules/schools/permissions";
import { FORBIDDEN_STATE, getActionContext, type ActionState } from "../action-context";

const fieldErrors = (error: z.ZodError) => ({
  ok: false,
  message: "Revisa los campos marcados",
  errors: z.flattenError(error).fieldErrors,
});

export async function recordDocumentAction(
  slug: string,
  athleteId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return FORBIDDEN_STATE;
  const f = formReader(form);
  const parsed = recordDocumentSchema.safeParse({
    documentTypeId: f.text("documentTypeId"),
    issuedOn: f.text("issuedOn"),
    notes: f.nullable("notes"),
    fileId: f.nullable("fileId"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const result = await recordDocument(
    db,
    storage(),
    member.ctx,
    athleteId,
    parsed.data,
    todayIn(member.school.timezone),
  );
  if (!result.ok) {
    if (result.error === "future_date")
      return { ok: false, errors: { issuedOn: ["La fecha no puede ser futura"] } };
    if (result.error === "file")
      return { ok: false, message: "El archivo no se subió completo. Intenta de nuevo." };
    return { ok: false, message: "El alumno o el documento no existen" };
  }
  refresh();
  return { ok: true, message: "Documento registrado" };
}

export async function removeDocumentAction(slug: string, athleteId: string, documentId: string) {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return FORBIDDEN_STATE;
  await removeDocument(db, storage(), member.ctx, athleteId, documentId);
  refresh();
  return { ok: true };
}

export async function setImageConsentAction(
  slug: string,
  athleteId: string,
  consent: "GRANTED" | "DENIED" | null,
) {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return FORBIDDEN_STATE;
  await setImageConsent(db, member.ctx, athleteId, consent);
  refresh();
  return { ok: true };
}

export async function saveDocumentTypeAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return FORBIDDEN_STATE;
  const f = formReader(form);
  const months = f.text("validityMonths");
  const parsed = documentTypeSchema.safeParse({
    name: f.text("name"),
    required: f.bool("required"),
    validityMonths: months ? Number(months) : null,
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    const saved = await saveDocumentType(db, member.ctx, parsed.data, f.text("id") || undefined);
    if (!saved) return { ok: false, message: "El documento no existe" };
  } catch (err) {
    if (err instanceof DuplicateDocumentTypeError) return { ok: false, errors: { name: [err.message] } };
    throw err;
  }
  refresh();
  return { ok: true, message: "Documento guardado" };
}

export async function setDocumentTypeActiveAction(slug: string, id: string, active: boolean) {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return FORBIDDEN_STATE;
  await setDocumentTypeActive(db, member.ctx, id, active);
  refresh();
  return { ok: true };
}

export async function addCertificationAction(
  slug: string,
  coachId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return FORBIDDEN_STATE;
  const f = formReader(form);
  const parsed = certificationSchema.safeParse({
    name: f.text("name"),
    issuedOn: f.nullable("issuedOn"),
    expiresOn: f.nullable("expiresOn"),
    fileId: f.nullable("fileId"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  if (!(await addCertification(db, storage(), member.ctx, coachId, parsed.data))) {
    return { ok: false, message: "No se pudo guardar. Revisa el archivo e intenta de nuevo." };
  }
  refresh();
  return { ok: true, message: "Certificación agregada" };
}

export async function removeCertificationAction(slug: string, coachId: string, id: string) {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return FORBIDDEN_STATE;
  await removeCertification(db, storage(), member.ctx, coachId, id);
  refresh();
  return { ok: true };
}
