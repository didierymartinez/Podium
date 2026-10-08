import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { enrollments, files, guardians } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { diskStorage } from "@/lib/storage/local";
import { reactivateFrozenEnrollments } from "@/modules/athletes/athletes";
import { getGuardian, listGuardians, updateGuardian } from "@/modules/athletes/guardians";
import { guardianSchema } from "@/modules/athletes/schemas";
import { addCertification, certificationAlerts, listCertifications } from "@/modules/coaches/certifications";
import { setImage } from "@/modules/files/attach";
import { canReadFile, confirmUpload, getFile, requestUpload } from "@/modules/files/files";
import { listNotifications } from "@/modules/notifications/notify";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { randomMobile, schoolFixture } from "@/test/fixtures";
import {
  documentAlerts,
  listAthleteDocuments,
  listDocumentTypes,
  recordDocument,
  removeDocument,
  saveDocumentType,
} from "./documents";
import { expiresOnFor } from "./status";

describe.skipIf(!testDatabaseUrl)("archivos, documentos, certificaciones y acudientes (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  let dir: string;
  let store: ReturnType<typeof diskStorage>;
  beforeAll(async () => {
    conn = connectTestDb();
    dir = await mkdtemp(path.join(os.tmpdir(), "podium-storage-"));
    store = diskStorage({ dir, secret: "test-secret" });
  });
  afterAll(async () => {
    await conn.close();
    await rm(dir, { recursive: true, force: true });
  });

  /** Simula al navegador subiendo a la URL firmada. */
  async function upload(url: string, contentType: string, bytes = 1000) {
    const u = new URL(url, "http://local");
    const key = decodeURIComponent(u.pathname.replace("/api/storage/", ""));
    return store.handlePut(key, u.searchParams, contentType, Buffer.alloc(bytes), 10 * 1024 * 1024);
  }

  it("sube con URL firmada, valida tipo y tamaño y reemplaza el logo", async () => {
    const f = await schoolFixture(conn.db);
    expect(
      await requestUpload(conn.db, store, f.ctx, {
        kind: "SCHOOL_LOGO",
        contentType: "application/pdf",
        size: 10,
        name: "x.pdf",
      }),
    ).toEqual({ ok: false, error: "type_not_allowed" });
    expect(
      await requestUpload(conn.db, store, f.ctx, {
        kind: "SCHOOL_LOGO",
        contentType: "image/png",
        size: 3e6,
        name: "x.png",
      }),
    ).toEqual({ ok: false, error: "too_large" });

    const first = await requestUpload(conn.db, store, f.ctx, {
      kind: "SCHOOL_LOGO",
      contentType: "image/png",
      size: 1000,
      name: "logo.png",
    });
    if (!first.ok) throw new Error("upload");
    // Una firma para otro tipo de contenido no sirve.
    expect(await upload(first.uploadUrl, "image/jpeg")).toBe(403);
    // Sin subir el archivo no se puede confirmar.
    expect(await setImage(conn.db, store, f.ctx, { kind: "SCHOOL_LOGO" }, first.fileId)).toBe(false);

    const second = await requestUpload(conn.db, store, f.ctx, {
      kind: "SCHOOL_LOGO",
      contentType: "image/png",
      size: 1000,
      name: "logo.png",
    });
    if (!second.ok) throw new Error("upload");
    expect(await upload(second.uploadUrl, "image/png")).toBe(200);
    expect(await setImage(conn.db, store, f.ctx, { kind: "SCHOOL_LOGO" }, second.fileId)).toBe(true);
    expect((await getFile(conn.db, f.ctx.schoolId, second.fileId))?.status).toBe("READY");

    const third = await requestUpload(conn.db, store, f.ctx, {
      kind: "SCHOOL_LOGO",
      contentType: "image/png",
      size: 500,
      name: "nuevo.png",
    });
    if (!third.ok) throw new Error("upload");
    await upload(third.uploadUrl, "image/png", 500);
    expect(await setImage(conn.db, store, f.ctx, { kind: "SCHOOL_LOGO" }, third.fileId)).toBe(true);
    // El logo anterior se borra del almacenamiento y de la base.
    expect(await getFile(conn.db, f.ctx.schoolId, second.fileId)).toBeNull();
    const signed = new URL(
      await store.presignGet((await getFile(conn.db, f.ctx.schoolId, third.fileId))!.storageKey),
      "http://local",
    );
    const key = decodeURIComponent(signed.pathname.replace("/api/storage/", ""));
    expect((await store.handleGet(key, signed.searchParams)).status).toBe(200);
    expect((await store.handleGet(key, new URLSearchParams())).status).toBe(403);

    // Otra escuela no ve ni confirma archivos ajenos.
    const other = await schoolFixture(conn.db, "Otra");
    expect(await getFile(conn.db, other.ctx.schoolId, third.fileId)).toBeNull();
    expect(await confirmUpload(conn.db, store, other.ctx, third.fileId, "SCHOOL_LOGO")).toBeNull();

    expect(canReadFile("SCHOOL_LOGO", ["GUARDIAN"])).toBe(true);
    expect(canReadFile("ATHLETE_DOCUMENT", ["COACH"])).toBe(false);
    expect(canReadFile("ATHLETE_PHOTO", ["COACH"])).toBe(true);
    expect(canReadFile("PAYMENT_PROOF", ["ADMIN"])).toBe(true);
  });

  it("documentos: tipos por defecto, vencimiento por vigencia, alertas y retiro", async () => {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía");
    const types = await listDocumentTypes(conn.db, f.ctx.schoolId);
    expect(types.map((t) => t.name)).toEqual([
      "Certificado médico",
      "Consentimiento informado",
      "Copia del documento de identidad",
    ]);
    const medical = types[0];

    let alerts = await documentAlerts(conn.db, f.ctx.schoolId, f.today);
    expect(alerts.map((a) => [a.document, a.status])).toEqual([
      ["Certificado médico", "missing"],
      ["Consentimiento informado", "missing"],
    ]);

    // Certificado expedido hace 11 meses y medio: vence pronto.
    const issued = addDays(f.today, -350);
    const ticket = await requestUpload(conn.db, store, f.ctx, {
      kind: "ATHLETE_DOCUMENT",
      contentType: "application/pdf",
      size: 2000,
      name: "certificado.pdf",
    });
    if (!ticket.ok) throw new Error("upload");
    await upload(ticket.uploadUrl, "application/pdf", 2000);
    expect(
      await recordDocument(
        conn.db,
        store,
        f.ctx,
        sofia,
        { documentTypeId: medical.id, issuedOn: issued, notes: null, fileId: ticket.fileId },
        f.today,
      ),
    ).toEqual({ ok: true });
    expect(
      await recordDocument(
        conn.db,
        store,
        f.ctx,
        sofia,
        { documentTypeId: medical.id, issuedOn: addDays(f.today, 1), notes: null, fileId: null },
        f.today,
      ),
    ).toEqual({ ok: false, error: "future_date" });

    const docs = await listAthleteDocuments(conn.db, f.ctx.schoolId, sofia, f.today);
    expect(docs[0]).toMatchObject({ status: "expiring", document: { fileId: ticket.fileId } });
    expect(docs[0].document?.expiresOn).toBe(expiresOnFor(issued, 12));
    alerts = await documentAlerts(conn.db, f.ctx.schoolId, f.today);
    expect(alerts[0]).toMatchObject({ document: "Certificado médico", status: "expiring" });

    // Renovar sin archivo conserva el soporte anterior.
    await recordDocument(
      conn.db,
      store,
      f.ctx,
      sofia,
      { documentTypeId: medical.id, issuedOn: f.today, notes: "Renovado", fileId: null },
      f.today,
    );
    const renewed = (await listAthleteDocuments(conn.db, f.ctx.schoolId, sofia, f.today))[0];
    expect(renewed).toMatchObject({
      status: "valid",
      document: { fileId: ticket.fileId, notes: "Renovado" },
    });

    // Tipo nuevo opcional sin vigencia; nombre duplicado rechazado.
    await saveDocumentType(conn.db, f.ctx, {
      name: "Póliza de accidentes",
      required: false,
      validityMonths: 12,
    });
    await expect(
      saveDocumentType(conn.db, f.ctx, {
        name: "Póliza de accidentes",
        required: true,
        validityMonths: null,
      }),
    ).rejects.toThrow("Ya existe");

    expect(await removeDocument(conn.db, store, f.ctx, sofia, renewed.document!.id)).toBe(true);
    const fileRows = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(files),
    );
    expect(fileRows).toHaveLength(0);
  });

  it("certificaciones de profesores con alerta de vencimiento", async () => {
    const f = await schoolFixture(conn.db);
    expect(
      await addCertification(conn.db, store, f.ctx, f.coachId, {
        name: "Primeros auxilios",
        issuedOn: addDays(f.today, -700),
        expiresOn: addDays(f.today, 10),
        fileId: null,
      }),
    ).toBe(true);
    await addCertification(conn.db, store, f.ctx, f.coachId, {
      name: "Curso de entrenador",
      issuedOn: null,
      expiresOn: null,
      fileId: null,
    });
    const certs = await listCertifications(conn.db, f.ctx.schoolId, f.coachId, f.today);
    expect(certs.map((c) => [c.name, c.status])).toEqual([
      ["Primeros auxilios", "expiring"],
      ["Curso de entrenador", "valid"],
    ]);
    expect((await certificationAlerts(conn.db, f.ctx.schoolId, f.today)).map((a) => a.coachName)).toEqual([
      "Juan Pérez",
    ]);
  });

  it("edita el acudiente y no permite repetir el celular", async () => {
    const f = await schoolFixture(conn.db);
    const takenPhone = randomMobile("30");
    await f.athlete("Sofía");
    await f.athlete("Tomás", { guardianPhone: takenPhone });
    const sofiaGuardian = (await listGuardians(conn.db, f.ctx.schoolId)).find((g) =>
      g.athletes[0].name.startsWith("Sofía"),
    )!;
    const input = guardianSchema.parse({
      firstName: "Laura María",
      lastName: "Gómez",
      documentType: "CC",
      documentNumber: "1020304050",
      phone: takenPhone,
      email: "laura@example.com",
    });
    expect(await updateGuardian(conn.db, f.ctx, sofiaGuardian.id, input)).toEqual({
      ok: false,
      error: "phone_taken",
    });
    const fresh = randomMobile("30");
    expect(await updateGuardian(conn.db, f.ctx, sofiaGuardian.id, { ...input, phone: fresh })).toEqual({
      ok: true,
    });
    const detail = await getGuardian(conn.db, f.ctx.schoolId, sofiaGuardian.id);
    expect(detail?.guardian).toMatchObject({
      firstName: "Laura María",
      phone: fresh,
      email: "laura@example.com",
    });
    expect(detail?.athletes.map((a) => a.firstName)).toEqual(["Sofía"]);
  });

  it("reactiva matrículas congeladas el día indicado y avisa a la familia", async () => {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía");
    const family = await createTestUser(conn.db, "familia");
    const guardian = (await listGuardians(conn.db, f.ctx.schoolId))[0];
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      await tx.update(guardians).set({ userId: family.id }).where(eq(guardians.id, guardian.id));
      await tx
        .update(enrollments)
        .set({ status: "FROZEN", frozenUntil: addDays(f.today, 1) })
        .where(eq(enrollments.athleteId, sofia));
    });
    expect(await reactivateFrozenEnrollments(conn.db, f.school, f.today)).toBe(0);
    expect(await reactivateFrozenEnrollments(conn.db, f.school, addDays(f.today, 1))).toBe(1);
    expect(await reactivateFrozenEnrollments(conn.db, f.school, addDays(f.today, 1))).toBe(0);
    const [notice] = await listNotifications(conn.db, f.ctx.schoolId, family.id);
    expect(notice).toMatchObject({ kind: "enrollment.reactivated", title: "Sofía vuelve a clases" });
  });
});
