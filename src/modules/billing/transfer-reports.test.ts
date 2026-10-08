import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asPortalUser } from "@/db/portal";
import { runInTenant } from "@/db/rls";
import { guardians, notifications } from "@/db/schema";
import { diskStorage } from "@/lib/storage/local";
import { requestUpload } from "@/modules/files/files";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { generateMonth, getInvoice, listInvoices } from "./invoices";
import { DEFAULT_BILLING_POLICY } from "./policy";
import {
  approveTransferReport,
  listTransferReports,
  notifyManagers,
  rejectTransferReport,
  reportTransfer,
} from "./transfer-reports";

describe.skipIf(!testDatabaseUrl)("transferencias reportadas (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  const store = diskStorage({ dir: "/tmp/podium-transfer-test", secret: "x" });
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  async function upload(schoolId: string, userId: string) {
    const ticket = await requestUpload(
      conn.db,
      store,
      { schoolId, actorUserId: userId },
      {
        kind: "PAYMENT_PROOF",
        contentType: "application/pdf",
        size: 8,
        name: "soporte.pdf",
      },
    );
    if (!ticket.ok) throw new Error("upload");
    const u = new URL(ticket.uploadUrl, "http://local");
    const key = decodeURIComponent(u.pathname.replace("/api/storage/", ""));
    await store.handlePut(key, u.searchParams, "application/pdf", Buffer.from("%PDF-1.4"), 10 * 1024 * 1024);
    return ticket.fileId;
  }

  it("la familia reporta; la escuela aprueba (crea el pago) o rechaza con motivo", async () => {
    const f = await schoolFixture(conn.db);
    await f.athlete("Sofía", { startDate: `${f.today.slice(0, 7)}-01` });
    await f.athlete("Otro");
    const ctx = { ...f.ctx, slug: f.school.slug };
    await generateMonth(conn.db, ctx, f.today.slice(0, 7), f.today, DEFAULT_BILLING_POLICY);
    const parent = await createTestUser(conn.db, "acudiente");
    const [guardian, otherGuardian] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      const rows = await tx.select().from(guardians).orderBy(asc(guardians.createdAt));
      await tx.update(guardians).set({ userId: parent.id }).where(eq(guardians.id, rows[0].id));
      return rows;
    });
    const [invoice] = await listInvoices(conn.db, f.ctx.schoolId, {
      guardianId: guardian.id,
      today: f.today,
    });
    const [foreign] = await listInvoices(conn.db, f.ctx.schoolId, {
      guardianId: otherGuardian.id,
      today: f.today,
    });
    const family = {
      schoolId: f.ctx.schoolId,
      userId: parent.id,
      slug: f.school.slug,
      guardianId: guardian.id,
    };

    const fileId = await upload(f.ctx.schoolId, parent.id);
    const base = {
      amount: invoice.total,
      paidOn: f.today,
      method: "TRANSFER" as const,
      reference: "ABC123",
      proofFileId: fileId,
    };

    // No puede pagar cuentas de otra familia.
    const wrong = await asPortalUser(parent.id, () =>
      reportTransfer(conn.db, store, family, { ...base, invoiceIds: [foreign.id] }, f.today),
    );
    expect(wrong).toEqual({ ok: false, error: "invalid_invoice" });

    const reported = await asPortalUser(parent.id, () =>
      reportTransfer(conn.db, store, family, { ...base, invoiceIds: [invoice.id] }, f.today),
    );
    if (!reported.ok) throw new Error(reported.error);
    expect(await notifyManagers(conn.db, f.ctx.schoolId, reported.notice)).toBe(1);

    // La familia solo ve sus reportes.
    const mine = await asPortalUser(parent.id, () => listTransferReports(conn.db, f.ctx.schoolId));
    expect(mine).toHaveLength(1);

    const [pending] = await listTransferReports(conn.db, f.ctx.schoolId, { status: "PENDING" });
    const approved = await approveTransferReport(conn.db, ctx, pending.report.id, DEFAULT_BILLING_POLICY);
    expect(approved.ok).toBe(true);
    expect((await getInvoice(conn.db, f.ctx.schoolId, invoice.id))?.invoice.status).toBe("PAID");
    expect((await approveTransferReport(conn.db, ctx, pending.report.id, DEFAULT_BILLING_POLICY)).ok).toBe(
      false,
    );

    const second = await asPortalUser(parent.id, () =>
      reportTransfer(conn.db, store, family, { ...base, proofFileId: fileId, amount: 5000 }, f.today),
    );
    if (!second.ok) throw new Error(second.error);
    const [again] = await listTransferReports(conn.db, f.ctx.schoolId, { status: "PENDING" });
    expect(await rejectTransferReport(conn.db, ctx, again.report.id, "No aparece en el banco")).toBe(true);
    const inbox = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(notifications).where(eq(notifications.userId, parent.id)),
    );
    expect(inbox.map((n) => n.kind)).toEqual(
      expect.arrayContaining(["payment.received", "payment_report.rejected"]),
    );
  });
});
