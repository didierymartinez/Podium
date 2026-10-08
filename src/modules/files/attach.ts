import { eq } from "drizzle-orm";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { athletes, auditLogs, files, schools } from "@/db/schema";
import type { Storage } from "@/lib/storage/types";
import { confirmUpload } from "./files";

export type ImageTarget = { kind: "SCHOOL_LOGO" } | { kind: "ATHLETE_PHOTO"; athleteId: string };
type Ctx = { schoolId: string; actorUserId: string };

/** Asigna (o quita con `fileId` null) el logo de la escuela o la foto de un alumno; borra la imagen anterior. */
export async function setImage(
  database: Database,
  store: Storage,
  ctx: Ctx,
  target: ImageTarget,
  fileId: string | null,
): Promise<boolean> {
  if (fileId && !(await confirmUpload(database, store, ctx, fileId, target.kind))) return false;
  const previousKey = await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const previous = await currentImage(tx, ctx.schoolId, target);
    if (previous === undefined) return undefined;
    if (target.kind === "SCHOOL_LOGO") {
      await tx.update(schools).set({ logoFileId: fileId }).where(eq(schools.id, ctx.schoolId));
    } else {
      await tx.update(athletes).set({ photoFileId: fileId }).where(eq(athletes.id, target.athleteId));
    }
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: target.kind === "SCHOOL_LOGO" ? "school.logo_changed" : "athlete.photo_changed",
      entity: target.kind === "SCHOOL_LOGO" ? "school" : "athlete",
      entityId: target.kind === "SCHOOL_LOGO" ? ctx.schoolId : target.athleteId,
      data: { fileId },
    });
    if (!previous || previous === fileId) return null;
    const [old] = await tx.delete(files).where(eq(files.id, previous)).returning({ key: files.storageKey });
    return old?.key ?? null;
  });
  if (previousKey === undefined) return false;
  if (previousKey) await store.delete(previousKey);
  return true;
}

/** Id de la imagen actual; undefined si el alumno no existe en esta escuela. */
async function currentImage(
  tx: Tx,
  schoolId: string,
  target: ImageTarget,
): Promise<string | null | undefined> {
  if (target.kind === "SCHOOL_LOGO") {
    const [row] = await tx.select({ id: schools.logoFileId }).from(schools).where(eq(schools.id, schoolId));
    return row ? row.id : undefined;
  }
  const [row] = await tx
    .select({ id: athletes.photoFileId })
    .from(athletes)
    .where(eq(athletes.id, target.athleteId));
  return row ? row.id : undefined;
}
