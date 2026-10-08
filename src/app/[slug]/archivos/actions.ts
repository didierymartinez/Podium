"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { storage } from "@/lib/storage";
import { setImage, type ImageTarget } from "@/modules/files/attach";
import { requestUpload, type FileKind, type UploadRequest } from "@/modules/files/files";
import { canManagePeople, canManageSettings, type SchoolRole } from "@/modules/schools/permissions";
import { getActionContext } from "../action-context";

const canUpload = (kind: FileKind) => (roles: readonly SchoolRole[]) =>
  kind === "SCHOOL_LOGO" ? canManageSettings(roles) : canManagePeople(roles);

export type UploadTicket = { ok: true; fileId: string; uploadUrl: string } | { ok: false; message: string };

/** Paso 1: el navegador pide una URL firmada y luego sube el archivo directo al almacenamiento. */
export async function requestUploadAction(slug: string, req: UploadRequest): Promise<UploadTicket> {
  const member = await getActionContext(slug, canUpload(req.kind));
  if (!member) return { ok: false, message: "No tienes permiso para subir este archivo." };
  const result = await requestUpload(db, storage(), member.ctx, req);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.error === "too_large" ? "El archivo es muy pesado." : "Ese tipo de archivo no está permitido.",
    };
  }
  return result;
}

/** Paso 2 para imágenes: logo de la escuela o foto del alumno. */
export async function setImageAction(slug: string, target: ImageTarget, fileId: string | null) {
  const member = await getActionContext(slug, canUpload(target.kind));
  if (!member) return { ok: false, message: "No tienes permiso." };
  const ok = await setImage(db, storage(), member.ctx, target, fileId);
  if (ok) refresh();
  return ok ? { ok: true } : { ok: false, message: "No se pudo guardar la imagen. Intenta de nuevo." };
}
