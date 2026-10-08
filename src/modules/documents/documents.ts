import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { athleteDocuments, athletes, auditLogs, documentTypes, enrollments, files } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import type { Storage } from "@/lib/storage/types";
import { confirmUpload } from "@/modules/files/files";
import { documentStatus, expiresOnFor, needsAttention, type DocumentStatus } from "./status";

type Ctx = { schoolId: string; actorUserId: string };

/** Documentos sugeridos al crear una escuela (se pueden editar en Configuración → Documentos). */
export const DEFAULT_DOCUMENT_TYPES = [
  { name: "Certificado médico", required: true, validityMonths: 12, position: 0 },
  { name: "Consentimiento informado", required: true, validityMonths: null, position: 1 },
  { name: "Copia del documento de identidad", required: false, validityMonths: null, position: 2 },
];

export const documentTypeSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre del documento").max(60),
  required: z.boolean(),
  validityMonths: z.number().int().min(1, "Mínimo 1 mes").max(120, "Máximo 120 meses").nullable(),
});
export type DocumentTypeInput = z.infer<typeof documentTypeSchema>;

export function listDocumentTypes(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx.select().from(documentTypes).orderBy(asc(documentTypes.position), asc(documentTypes.name)),
  );
}

export class DuplicateDocumentTypeError extends Error {
  constructor() {
    super("Ya existe un documento con ese nombre");
  }
}

export function saveDocumentType(database: Database, ctx: Ctx, input: DocumentTypeInput, id?: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const existing = await tx
      .select({ id: documentTypes.id })
      .from(documentTypes)
      .where(eq(documentTypes.name, input.name));
    if (existing.some((e) => e.id !== id)) throw new DuplicateDocumentTypeError();
    let rowId = id;
    if (id) {
      const [row] = await tx.update(documentTypes).set(input).where(eq(documentTypes.id, id)).returning();
      if (!row) return null;
    } else {
      const position = (await tx.select({ id: documentTypes.id }).from(documentTypes)).length;
      const [row] = await tx
        .insert(documentTypes)
        .values({ schoolId: ctx.schoolId, ...input, position })
        .returning();
      rowId = row.id;
    }
    await audit(
      tx,
      ctx,
      id ? "document_type.updated" : "document_type.created",
      "document_type",
      rowId!,
      input,
    );
    return rowId!;
  });
}

export function setDocumentTypeActive(database: Database, ctx: Ctx, id: string, active: boolean) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx.update(documentTypes).set({ active }).where(eq(documentTypes.id, id)).returning();
    if (row)
      await audit(
        tx,
        ctx,
        active ? "document_type.activated" : "document_type.archived",
        "document_type",
        id,
        {},
      );
    return Boolean(row);
  });
}

export type AthleteDocumentView = {
  type: { id: string; name: string; required: boolean; validityMonths: number | null };
  document: {
    id: string;
    issuedOn: IsoDate;
    expiresOn: IsoDate | null;
    fileId: string | null;
    notes: string | null;
  } | null;
  status: DocumentStatus;
};

/** Documentos de un alumno: cada tipo activo con su estado (y los de tipos archivados que ya tenía). */
export function listAthleteDocuments(
  database: Database,
  schoolId: string,
  athleteId: string,
  today: IsoDate,
): Promise<AthleteDocumentView[]> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [types, docs] = await Promise.all([
      tx.select().from(documentTypes).orderBy(asc(documentTypes.position), asc(documentTypes.name)),
      tx.select().from(athleteDocuments).where(eq(athleteDocuments.athleteId, athleteId)),
    ]);
    return types
      .filter((t) => t.active || docs.some((d) => d.documentTypeId === t.id))
      .map((t) => {
        const doc = docs.find((d) => d.documentTypeId === t.id) ?? null;
        return {
          type: {
            id: t.id,
            name: t.name,
            required: t.required && t.active,
            validityMonths: t.validityMonths,
          },
          document: doc && {
            id: doc.id,
            issuedOn: doc.issuedOn,
            expiresOn: doc.expiresOn,
            fileId: doc.fileId,
            notes: doc.notes,
          },
          status: documentStatus(doc, t.required && t.active, today),
        };
      });
  });
}

export const recordDocumentSchema = z.object({
  documentTypeId: z.uuid(),
  issuedOn: z.iso.date("Escribe la fecha de expedición"),
  notes: z.string().trim().max(200).nullable(),
  fileId: z.uuid().nullable(),
});
export type RecordDocumentInput = z.infer<typeof recordDocumentSchema>;

/** Registra (o renueva) un documento recibido; la fecha de vencimiento sale de la vigencia del tipo. */
export async function recordDocument(
  database: Database,
  store: Storage,
  ctx: Ctx,
  athleteId: string,
  input: RecordDocumentInput,
  today: IsoDate,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "future_date" | "file" }> {
  if (input.issuedOn > today) return { ok: false, error: "future_date" };
  if (input.fileId && !(await confirmUpload(database, store, ctx, input.fileId, "ATHLETE_DOCUMENT"))) {
    return { ok: false, error: "file" };
  }
  const replacedKey = await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [[type], [athlete]] = await Promise.all([
      tx.select().from(documentTypes).where(eq(documentTypes.id, input.documentTypeId)),
      tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.id, athleteId)),
    ]);
    if (!type || !athlete) return undefined;
    const [previous] = await tx
      .select({ fileId: athleteDocuments.fileId })
      .from(athleteDocuments)
      .where(and(eq(athleteDocuments.athleteId, athleteId), eq(athleteDocuments.documentTypeId, type.id)));
    const values = {
      issuedOn: input.issuedOn,
      expiresOn: expiresOnFor(input.issuedOn, type.validityMonths),
      notes: input.notes,
      fileId: input.fileId ?? previous?.fileId ?? null,
      receivedByUserId: ctx.actorUserId,
    };
    await tx
      .insert(athleteDocuments)
      .values({ schoolId: ctx.schoolId, athleteId, documentTypeId: type.id, ...values })
      .onConflictDoUpdate({
        target: [athleteDocuments.athleteId, athleteDocuments.documentTypeId],
        set: values,
      });
    await audit(tx, ctx, "athlete_document.recorded", "athlete", athleteId, {
      documentType: type.name,
      issuedOn: values.issuedOn,
      expiresOn: values.expiresOn,
      withFile: Boolean(values.fileId),
    });
    if (input.fileId && previous?.fileId && previous.fileId !== input.fileId) {
      const [old] = await tx
        .delete(files)
        .where(eq(files.id, previous.fileId))
        .returning({ key: files.storageKey });
      return old?.key ?? null;
    }
    return null;
  });
  if (replacedKey === undefined) return { ok: false, error: "not_found" };
  if (replacedKey) await store.delete(replacedKey);
  return { ok: true };
}

export async function removeDocument(
  database: Database,
  store: Storage,
  ctx: Ctx,
  athleteId: string,
  documentId: string,
) {
  const key = await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [doc] = await tx
      .delete(athleteDocuments)
      .where(and(eq(athleteDocuments.id, documentId), eq(athleteDocuments.athleteId, athleteId)))
      .returning();
    if (!doc) return undefined;
    await audit(tx, ctx, "athlete_document.removed", "athlete", athleteId, {
      documentTypeId: doc.documentTypeId,
    });
    if (!doc.fileId) return null;
    const [file] = await tx
      .delete(files)
      .where(eq(files.id, doc.fileId))
      .returning({ key: files.storageKey });
    return file?.key ?? null;
  });
  if (key) await store.delete(key);
  return key !== undefined;
}

export type DocumentAlert = {
  athleteId: string;
  name: string;
  document: string;
  status: DocumentStatus;
  expiresOn: IsoDate | null;
};

/**
 * Documentos que requieren atención de alumnos con matrícula vigente (activos o preinscritos):
 * obligatorios pendientes, vencidos o que vencen en los próximos 30 días.
 */
export function documentAlerts(
  database: Database,
  schoolId: string,
  today: IsoDate,
): Promise<DocumentAlert[]> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const current = await tx
      .selectDistinct({ id: athletes.id, firstName: athletes.firstName, lastName: athletes.lastName })
      .from(athletes)
      .innerJoin(enrollments, eq(enrollments.athleteId, athletes.id))
      .where(inArray(enrollments.status, ["ACTIVE", "PRE_ENROLLED"]));
    if (current.length === 0) return [];
    const [types, docs] = await Promise.all([
      tx.select().from(documentTypes).where(eq(documentTypes.active, true)),
      tx
        .select()
        .from(athleteDocuments)
        .where(
          inArray(
            athleteDocuments.athleteId,
            current.map((a) => a.id),
          ),
        ),
    ]);
    const alerts: DocumentAlert[] = [];
    for (const a of current) {
      for (const t of types) {
        const doc = docs.find((d) => d.athleteId === a.id && d.documentTypeId === t.id);
        const status = documentStatus(doc, t.required, today);
        if (needsAttention(status)) {
          alerts.push({
            athleteId: a.id,
            name: `${a.firstName} ${a.lastName}`,
            document: t.name,
            status,
            expiresOn: doc?.expiresOn ?? null,
          });
        }
      }
    }
    const order: Record<DocumentStatus, number> = {
      expired: 0,
      expiring: 1,
      missing: 2,
      valid: 3,
      optional: 4,
    };
    return alerts.sort((x, y) => order[x.status] - order[y.status] || x.name.localeCompare(y.name, "es"));
  });
}

export function setImageConsent(
  database: Database,
  ctx: Ctx,
  athleteId: string,
  consent: "GRANTED" | "DENIED" | null,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .update(athletes)
      .set({ imageConsent: consent, imageConsentAt: consent ? new Date() : null })
      .where(eq(athletes.id, athleteId))
      .returning({ id: athletes.id });
    if (row) await audit(tx, ctx, "athlete.image_consent", "athlete", athleteId, { consent });
    return Boolean(row);
  });
}

async function audit(tx: Tx, ctx: Ctx, action: string, entity: string, entityId: string, data: object) {
  await tx
    .insert(auditLogs)
    .values({ schoolId: ctx.schoolId, actorUserId: ctx.actorUserId, action, entity, entityId, data });
}
