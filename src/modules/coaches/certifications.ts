import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, coachCertifications, coaches, files } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import type { Storage } from "@/lib/storage/types";
import { documentStatus, needsAttention, type DocumentStatus } from "@/modules/documents/status";
import { confirmUpload } from "@/modules/files/files";

type Ctx = { schoolId: string; actorUserId: string };

export const certificationSchema = z
  .object({
    name: z.string().trim().min(3, "Escribe el nombre (p. ej. Primeros auxilios)").max(80),
    issuedOn: z.iso.date().nullable(),
    expiresOn: z.iso.date().nullable(),
    fileId: z.uuid().nullable(),
  })
  .refine((c) => !c.issuedOn || !c.expiresOn || c.expiresOn >= c.issuedOn, {
    message: "El vencimiento debe ser posterior a la expedición",
    path: ["expiresOn"],
  });
export type CertificationInput = z.infer<typeof certificationSchema>;

export type CertificationView = {
  id: string;
  name: string;
  issuedOn: IsoDate | null;
  expiresOn: IsoDate | null;
  fileId: string | null;
  status: DocumentStatus;
};

export function listCertifications(
  database: Database,
  schoolId: string,
  coachId: string,
  today: IsoDate,
): Promise<CertificationView[]> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select()
      .from(coachCertifications)
      .where(eq(coachCertifications.coachId, coachId))
      .orderBy(asc(coachCertifications.expiresOn), asc(coachCertifications.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      issuedOn: r.issuedOn,
      expiresOn: r.expiresOn,
      fileId: r.fileId,
      status: documentStatus(r, true, today),
    }));
  });
}

export async function addCertification(
  database: Database,
  store: Storage,
  ctx: Ctx,
  coachId: string,
  input: CertificationInput,
): Promise<boolean> {
  if (input.fileId && !(await confirmUpload(database, store, ctx, input.fileId, "COACH_CERTIFICATE")))
    return false;
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [coach] = await tx.select({ id: coaches.id }).from(coaches).where(eq(coaches.id, coachId));
    if (!coach) return false;
    const [row] = await tx
      .insert(coachCertifications)
      .values({ schoolId: ctx.schoolId, coachId, ...input })
      .returning({ id: coachCertifications.id });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "coach.certification_added",
      entity: "coach",
      entityId: coachId,
      data: { certificationId: row.id, name: input.name, expiresOn: input.expiresOn },
    });
    return true;
  });
}

export async function removeCertification(
  database: Database,
  store: Storage,
  ctx: Ctx,
  coachId: string,
  id: string,
) {
  const key = await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .delete(coachCertifications)
      .where(and(eq(coachCertifications.id, id), eq(coachCertifications.coachId, coachId)))
      .returning();
    if (!row) return undefined;
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "coach.certification_removed",
      entity: "coach",
      entityId: coachId,
      data: { name: row.name },
    });
    if (!row.fileId) return null;
    const [file] = await tx
      .delete(files)
      .where(eq(files.id, row.fileId))
      .returning({ key: files.storageKey });
    return file?.key ?? null;
  });
  if (key) await store.delete(key);
  return key !== undefined;
}

export type CertificationAlert = {
  coachId: string;
  coachName: string;
  name: string;
  expiresOn: IsoDate | null;
  status: DocumentStatus;
};

/** Certificaciones vencidas o que vencen en 30 días de profesores activos. */
export function certificationAlerts(
  database: Database,
  schoolId: string,
  today: IsoDate,
): Promise<CertificationAlert[]> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({ cert: coachCertifications, firstName: coaches.firstName, lastName: coaches.lastName })
      .from(coachCertifications)
      .innerJoin(coaches, eq(coaches.id, coachCertifications.coachId))
      .where(eq(coaches.active, true))
      .orderBy(asc(coachCertifications.expiresOn));
    return rows
      .map(({ cert, firstName, lastName }) => ({
        coachId: cert.coachId,
        coachName: `${firstName} ${lastName}`,
        name: cert.name,
        expiresOn: cert.expiresOn,
        status: documentStatus(cert, true, today),
      }))
      .filter((a) => needsAttention(a.status));
  });
}
