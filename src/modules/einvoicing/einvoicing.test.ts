import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diskStorage } from "@/lib/storage/local";
import { listGuardians } from "@/modules/athletes/guardians";
import { generateMonth, listInvoices } from "@/modules/billing/invoices";
import { recordPayment } from "@/modules/billing/payments";
import { DEFAULT_BILLING_POLICY as policy } from "@/modules/billing/policy";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { alegraProvider } from "./alegra";
import { connectAccount, einvoiceFor, getAccount, issuePending, retryEInvoice } from "./einvoicing";
import type { EInvoiceDraft, EInvoiceProvider } from "./provider";

describe("Alegra (HTTP simulado)", () => {
  it("crea el cliente si no existe y emite con timbrado", async () => {
    const calls: { url: string; method: string; body: unknown; auth: string | null }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
        auth: new Headers(init?.headers).get("authorization"),
      });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (url.endsWith("/company")) return json({ name: "Club Prueba SAS" });
      if (url.includes("/contacts?")) return json([]);
      if (url.endsWith("/contacts")) return json({ id: 77 }, 201);
      if (url.endsWith("/invoices"))
        return json({ id: 901, numberTemplate: { fullNumber: "FE-15" }, stamp: { cufe: "abc123" } }, 201);
      return json({ message: "no" }, 404);
    }) as typeof fetch;
    const alegra = alegraProvider(fake);
    const creds = { username: "admin@club.co", token: "token-123", itemId: "5" };
    expect(await alegra.verify(creds)).toEqual({ ok: true, company: "Club Prueba SAS" });
    const draft: EInvoiceDraft = {
      date: "2026-10-08",
      dueDate: "2026-10-08",
      customer: { name: "Laura Gómez", idType: "CC", idNumber: "1020", email: null, phone: "+573001112233" },
      lines: [{ description: "Mensualidad octubre · Sofía", amount: 120000 }],
      reference: "CC-0001",
    };
    expect(await alegra.issue(creds, draft)).toEqual({
      ok: true,
      externalId: "901",
      number: "FE-15",
      cufe: "abc123",
    });
    expect(calls[0].auth).toBe(`Basic ${Buffer.from("admin@club.co:token-123").toString("base64")}`);
    const invoice = calls.find((c) => c.url.endsWith("/invoices"))!.body as {
      client: { id: string };
      items: { id: string; price: number }[];
      stamp: { generateStamp: boolean };
    };
    expect(invoice).toMatchObject({
      client: { id: "77" },
      items: [{ id: "5", price: 120000 }],
      stamp: { generateStamp: true },
    });
  });
});

describe.skipIf(!testDatabaseUrl)("facturación electrónica (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  const store = diskStorage({ dir: "/tmp/podium-einvoice-test", secret: "x" });
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("emite al quedar pagada, registra el error y reintenta", async () => {
    const f = await schoolFixture(conn.db);
    const ctx = { ...f.ctx, slug: f.school.slug };
    await f.athlete("Sofía", { startDate: "2026-09-01" });
    const drafts: EInvoiceDraft[] = [];
    let fail = true;
    const provider: EInvoiceProvider = {
      name: "alegra",
      async verify(c) {
        return c.token === "bueno-123"
          ? { ok: true, company: "Club" }
          : { ok: false, error: "Token inválido" };
      },
      async issue(_c, draft) {
        drafts.push(draft);
        return fail
          ? { ok: false, error: "Numeración vencida" }
          : { ok: true, externalId: "1", number: "FE-1", cufe: "x" };
      },
    };
    expect(
      await connectAccount(
        conn.db,
        f.ctx,
        { username: "a@club.co", token: "malo-123", itemId: "5" },
        provider,
      ),
    ).toEqual({ ok: false, error: "Token inválido" });
    expect(
      await connectAccount(
        conn.db,
        f.ctx,
        { username: "a@club.co", token: "bueno-123", itemId: "5" },
        provider,
      ),
    ).toEqual({ ok: true, company: "Club" });
    expect(await getAccount(conn.db, f.ctx.schoolId)).toMatchObject({ username: "a@club.co", enabled: true });

    await generateMonth(conn.db, ctx, "2026-10", "2026-10-01", policy);
    const [invoice] = await listInvoices(conn.db, f.ctx.schoolId, { today: "2026-10-01" });
    expect(await issuePending(conn.db, f.ctx.schoolId, provider, "2026-10-08")).toBe(0); // aún sin pagar
    const [laura] = await listGuardians(conn.db, f.ctx.schoolId);
    await recordPayment(
      conn.db,
      store,
      ctx,
      {
        guardianId: laura.id,
        amount: invoice.total,
        paidOn: "2026-10-08",
        method: "CASH",
        reference: null,
        notes: null,
        proofFileId: null,
      },
      "2026-10-08",
      policy,
    );

    expect(await issuePending(conn.db, f.ctx.schoolId, provider, "2026-10-08")).toBe(0);
    expect(await einvoiceFor(conn.db, f.ctx.schoolId, invoice.id)).toMatchObject({
      status: "ERROR",
      error: "Numeración vencida",
      attempts: 1,
    });
    // Sin documento del acudiente se factura a consumidor final.
    expect(drafts[0].customer).toMatchObject({ idNumber: "222222222222", name: "Consumidor final" });

    fail = false;
    expect(await retryEInvoice(conn.db, f.ctx, invoice.id)).toBe(true);
    expect(await issuePending(conn.db, f.ctx.schoolId, provider, "2026-10-08")).toBe(1);
    expect(await einvoiceFor(conn.db, f.ctx.schoolId, invoice.id)).toMatchObject({
      status: "ISSUED",
      number: "FE-1",
    });
    expect(await issuePending(conn.db, f.ctx.schoolId, provider, "2026-10-08")).toBe(0);
  });
});
