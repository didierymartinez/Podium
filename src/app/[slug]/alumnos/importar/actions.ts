"use server";

import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { parseCsv, readFirstSheet } from "@/lib/xlsx";
import { readBillingPolicy } from "@/modules/billing/policy";
import {
  MAX_IMPORT_ROWS,
  commitImport,
  previewImport,
  type ImportPreview,
  type ImportResult,
} from "@/modules/imports/athletes";
import { canManagePeople } from "@/modules/schools/permissions";
import { getActionContext } from "../../action-context";

const MAX_BYTES = 900 * 1024;
const FORBIDDEN = { ok: false as const, error: "No tienes permiso para esta acción." };

export type PreviewState = { preview?: ImportPreview; sheet?: string[][]; fileName?: string };

/** Lee el archivo subido (.xlsx o .csv) y devuelve la vista previa sin escribir nada. */
export async function previewImportAction(
  slug: string,
  _prev: PreviewState,
  form: FormData,
): Promise<PreviewState> {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return { preview: FORBIDDEN };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { preview: { ok: false, error: "Elige un archivo" } };
  if (file.size > MAX_BYTES) return { preview: { ok: false, error: "El archivo pesa más de 900 KB" } };
  const buffer = Buffer.from(await file.arrayBuffer());
  let sheet: string[][];
  try {
    sheet = /\.csv$/i.test(file.name) ? parseCsv(buffer.toString("utf8")) : readFirstSheet(buffer);
  } catch {
    return {
      preview: { ok: false, error: "No pudimos leer el archivo. Súbelo en formato Excel (.xlsx) o CSV." },
    };
  }
  // Solo las columnas y filas útiles viajan de vuelta al navegador para confirmar.
  sheet = sheet.slice(0, MAX_IMPORT_ROWS + 20).map((r) => r.slice(0, 40).map((c) => (c ?? "").slice(0, 200)));
  const preview = await previewImport(db, manager.ctx.schoolId, sheet, todayIn(manager.school.timezone));
  return { preview, sheet: preview.ok ? sheet : undefined, fileName: file.name };
}

/** Confirma la importación: el servidor vuelve a validar todo y escribe en una sola transacción. */
export async function commitImportAction(slug: string, sheet: string[][]): Promise<ImportResult> {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return FORBIDDEN;
  if (!Array.isArray(sheet) || sheet.length > MAX_IMPORT_ROWS + 20 || !sheet.every((r) => Array.isArray(r)))
    return { ok: false, error: "Archivo inválido" };
  const clean = sheet.map((r) => r.slice(0, 40).map((c) => String(c ?? "").slice(0, 200)));
  return commitImport(
    db,
    manager.ctx,
    clean,
    todayIn(manager.school.timezone),
    readBillingPolicy(manager.school.settings.billing),
  );
}
