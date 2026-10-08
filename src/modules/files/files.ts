import { and, eq } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { athletes, files, type fileKindEnum } from "@/db/schema";
import type { Storage } from "@/lib/storage/types";
import type { SchoolRole } from "@/modules/schools/permissions";
import { canManagePeople } from "@/modules/schools/permissions";

export type FileKind = (typeof fileKindEnum.enumValues)[number];

const IMAGES = ["image/png", "image/jpeg", "image/webp"];
const DOCS = [...IMAGES, "application/pdf"];

/** Tipos y tamaños permitidos por clase de archivo. */
export const FILE_RULES: Record<FileKind, { types: string[]; maxBytes: number }> = {
  SCHOOL_LOGO: { types: [...IMAGES, "image/svg+xml"], maxBytes: 2 * 1024 * 1024 },
  ATHLETE_PHOTO: { types: IMAGES, maxBytes: 5 * 1024 * 1024 },
  ATHLETE_DOCUMENT: { types: DOCS, maxBytes: 10 * 1024 * 1024 },
  COACH_CERTIFICATE: { types: DOCS, maxBytes: 10 * 1024 * 1024 },
  PAYMENT_PROOF: { types: DOCS, maxBytes: 10 * 1024 * 1024 },
};

export type UploadRequest = { kind: FileKind; contentType: string; size: number; name: string };
export type UploadError = "type_not_allowed" | "too_large";

export function validateUpload(req: UploadRequest): UploadError | null {
  const rule = FILE_RULES[req.kind];
  if (!rule.types.includes(req.contentType)) return "type_not_allowed";
  if (!Number.isFinite(req.size) || req.size <= 0 || req.size > rule.maxBytes) return "too_large";
  return null;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

/** Registra el archivo como pendiente y entrega la URL firmada para subirlo. */
export async function requestUpload(
  database: Database,
  store: Storage,
  ctx: { schoolId: string; actorUserId: string },
  req: UploadRequest,
): Promise<{ ok: true; fileId: string; uploadUrl: string } | { ok: false; error: UploadError }> {
  const error = validateUpload(req);
  if (error) return { ok: false, error };
  const id = crypto.randomUUID();
  const storageKey = `${ctx.schoolId}/${req.kind.toLowerCase()}/${id}.${EXTENSIONS[req.contentType]}`;
  await runInTenant(database, { schoolId: ctx.schoolId }, (tx) =>
    tx.insert(files).values({
      id,
      schoolId: ctx.schoolId,
      kind: req.kind,
      storageKey,
      contentType: req.contentType,
      size: req.size,
      originalName: req.name.slice(0, 120) || "archivo",
      uploadedByUserId: ctx.actorUserId,
    }),
  );
  return { ok: true, fileId: id, uploadUrl: await store.presignPut(storageKey, req.contentType) };
}

/**
 * Verifica que el archivo llegó al almacenamiento con el tamaño y tipo declarados y lo marca listo.
 * Devuelve null si no corresponde (otra escuela, otro tipo, no se subió).
 */
export async function confirmUpload(
  database: Database,
  store: Storage,
  ctx: { schoolId: string; actorUserId: string },
  fileId: string,
  kind: FileKind,
) {
  const row = await getFile(database, ctx.schoolId, fileId);
  if (!row || row.kind !== kind || row.uploadedByUserId !== ctx.actorUserId) return null;
  if (row.status === "READY") return row;
  const head = await store.head(row.storageKey);
  if (
    !head ||
    head.size > FILE_RULES[kind].maxBytes ||
    (head.contentType && head.contentType !== row.contentType)
  ) {
    await store.delete(row.storageKey);
    return null;
  }
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [ready] = await tx
      .update(files)
      .set({ status: "READY", size: head.size })
      .where(and(eq(files.id, fileId), eq(files.status, "PENDING")))
      .returning();
    return ready ?? null;
  });
}

export async function getFile(database: Database, schoolId: string, fileId: string) {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx.select().from(files).where(eq(files.id, fileId)),
  );
  return row ?? null;
}

/**
 * Quién puede ver cada clase de archivo. El logo lo ve toda la escuela; fotos de alumnos también
 * los profesores; documentos, certificados y soportes de pago solo la administración
 * (las familias ven los suyos desde su portal).
 */
export function canReadFile(kind: FileKind, roles: readonly SchoolRole[]): boolean {
  if (kind === "SCHOOL_LOGO") return true;
  if (canManagePeople(roles)) return true;
  return kind === "ATHLETE_PHOTO" && roles.includes("COACH");
}

/** Ruta interna que redirige a la URL firmada (60 s). */
export const fileHref = (slug: string, fileId: string) =>
  `/api/files/${fileId}?escuela=${encodeURIComponent(slug)}`;

/** ¿Es la foto de un alumno visible en el contexto actual? (con RLS de familia: solo sus hijos). */
export async function isFamilyPhoto(database: Database, schoolId: string, fileId: string) {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx.select({ id: athletes.id }).from(athletes).where(eq(athletes.photoFileId, fileId)).limit(1),
  );
  return Boolean(row);
}
