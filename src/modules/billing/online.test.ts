import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listGuardians } from "@/modules/athletes/guardians";
import { signedTestEvent, wompiProvider } from "@/modules/payments/wompi";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { generateMonth, getInvoice, listInvoices } from "./invoices";
import {
  handleProviderEvent,
  intentByReference,
  paymentAccountStatus,
  reconcileIntents,
  savePaymentAccount,
  startOnlinePayment,
} from "./online";
import { DEFAULT_BILLING_POLICY, type BillingPolicy } from "./policy";

const policy: BillingPolicy = {
  ...DEFAULT_BILLING_POLICY,
  earlyPayment: { type: "percent", value: 5, untilDay: 5 },
};
const keys = {
  environment: "sandbox" as const,
  publicKey: "pub_test_club",
  privateKey: "prv_test_club",
  eventsSecret: "test_events_club",
  integritySecret: "test_integrity_club",
};

describe.skipIf(!testDatabaseUrl)("pagos en línea (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  const transactions = new Map<string, Record<string, unknown>[]>();
  const fakeFetch = (async (url: string) => {
    const u = new URL(String(url));
    if (u.pathname.includes("/merchants/")) {
      return new Response(JSON.stringify({ data: { legal_name: "Club SAS" } }), { status: 200 });
    }
    const ref = u.searchParams.get("reference") ?? "";
    return new Response(JSON.stringify({ data: transactions.get(ref) ?? [] }), { status: 200 });
  }) as unknown as typeof fetch;
  const provider = wompiProvider(fakeFetch);

  it("conecta la cuenta, paga con link, aplica el webhook una sola vez y concilia lo perdido", async () => {
    const f = await schoolFixture(conn.db);
    await f.athlete("Sofía", { startDate: "2026-09-01" });
    const ctx = { ...f.ctx, slug: f.school.slug };
    expect(
      await savePaymentAccount(conn.db, provider, f.ctx, { ...keys, publicKey: "pub_prod_x" }),
    ).toMatchObject({
      ok: false,
    });
    expect(await savePaymentAccount(conn.db, provider, f.ctx, keys)).toEqual({
      ok: true,
      merchantName: "Club SAS",
    });
    expect(await paymentAccountStatus(conn.db, f.ctx.schoolId)).toMatchObject({ publicKey: "pub_test_club" });

    await generateMonth(conn.db, ctx, "2026-10", "2026-10-01", policy);
    const [invoice] = await listInvoices(conn.db, f.ctx.schoolId, { today: "2026-10-01" });
    const [guardian] = await listGuardians(conn.db, f.ctx.schoolId);

    // Día 3: con pronto pago 5 % paga $95.000 de $100.000.
    const start = await startOnlinePayment(
      conn.db,
      provider,
      f.ctx,
      {
        guardianId: guardian.id,
        invoiceIds: [invoice.id],
        redirectUrl: (r) => `https://podium.test/x?ref=${r}`,
      },
      "2026-10-03",
      policy,
    );
    if (!start.ok) throw new Error(start.error);
    expect(start.amount).toBe(95_000);
    expect(new URL(start.url).searchParams.get("amount-in-cents")).toBe("9500000");

    const tx = {
      id: "15113-1",
      status: "APPROVED",
      amount_in_cents: 9_500_000,
      reference: start.reference,
      created_at: "2026-10-03T20:00:00Z",
    };
    const school = { id: f.ctx.schoolId, slug: f.school.slug, timezone: "America/Bogota" };
    expect(await handleProviderEvent(conn.db, provider, school, signedTestEvent(tx, "otro"), policy)).toBe(
      "invalid_signature",
    );
    expect(
      await handleProviderEvent(conn.db, provider, school, signedTestEvent(tx, keys.eventsSecret), policy),
    ).toBe("applied");
    expect(
      await handleProviderEvent(conn.db, provider, school, signedTestEvent(tx, keys.eventsSecret), policy),
    ).toBe("already_applied");
    const paid = await getInvoice(conn.db, f.ctx.schoolId, invoice.id);
    expect(paid?.invoice).toMatchObject({ status: "PAID", paid: 95_000, credited: 5_000 });
    expect(paid?.allocations[0]).toMatchObject({ method: "ONLINE" });

    // Noviembre: el webhook nunca llega; la conciliación lo recupera.
    await generateMonth(conn.db, ctx, "2026-11", "2026-11-01", policy);
    const [november] = await listInvoices(conn.db, f.ctx.schoolId, {
      today: "2026-11-01",
      period: "2026-11",
    });
    const lost = await startOnlinePayment(
      conn.db,
      provider,
      f.ctx,
      {
        guardianId: guardian.id,
        invoiceIds: [november.id],
        redirectUrl: (r) => `https://podium.test/x?ref=${r}`,
      },
      "2026-11-20",
      policy,
    );
    if (!lost.ok) throw new Error(lost.error);
    transactions.set(lost.reference, [
      {
        id: "15113-2",
        status: "APPROVED",
        amount_in_cents: lost.amount * 100,
        reference: lost.reference,
        created_at: "2026-11-20T15:00:00Z",
      },
    ]);
    const later = new Date(Date.now() + 30 * 60_000);
    expect(await reconcileIntents(conn.db, provider, school, later, policy)).toBe(1);
    expect(await reconcileIntents(conn.db, provider, school, later, policy)).toBe(0);
    expect((await intentByReference(conn.db, f.ctx.schoolId, lost.reference))?.status).toBe("APPROVED");
    expect((await getInvoice(conn.db, f.ctx.schoolId, november.id))?.invoice.status).toBe("PAID");
  });
});
