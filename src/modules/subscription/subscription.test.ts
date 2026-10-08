import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { platformInvoices, schools, subscriptions } from "@/db/schema";
import { consoleMailer } from "@/lib/mailer/console";
import type { ProviderKeys, ProviderTransaction } from "@/modules/payments/provider";
import { signedTestEvent, wompiProvider } from "@/modules/payments/wompi";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import type { CardApi } from "./podium-wompi";
import { PLANS, exceedsPlan, monthlyRevenue, planFor, priceOf } from "./plans";
import {
  addMonths,
  cancelSubscription,
  getSubscription,
  handlePodiumEvent,
  periodEndOf,
  runSubscriptionJob,
  saveBillingProfile,
  startCheckout,
  subscribeWithCard,
} from "./subscription";

describe("planes y periodos", () => {
  it("elige el plan por alumnos activos y calcula precios", () => {
    expect(planFor(10).code).toBe("semilla");
    expect(planFor(51).code).toBe("club");
    expect(planFor(5000).code).toBe("elite");
    expect(exceedsPlan(PLANS[0], 51)).toBe(true);
    expect(priceOf(PLANS[0], "ANNUAL")).toBe(PLANS[0].monthly * 10);
    expect(priceOf(PLANS[0], "MONTHLY", 50)).toBe(PLANS[0].monthly / 2);
    expect(monthlyRevenue(PLANS[1], "ANNUAL")).toBe(Math.round((PLANS[1].monthly * 10) / 12));
  });

  it("suma meses ajustando fin de mes", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
    expect(periodEndOf("2026-10-08", "MONTHLY")).toBe("2026-11-07");
    expect(periodEndOf("2026-10-08", "ANNUAL")).toBe("2027-10-07");
  });
});

const KEYS: ProviderKeys = {
  environment: "sandbox",
  publicKey: "pub_test_x",
  privateKey: "prv_test_x",
  eventsSecret: "test_events_x",
  integritySecret: "test_integrity_x",
};

function fakeCards(statuses: ProviderTransaction["status"][]): CardApi & { charges: string[] } {
  const charges: string[] = [];
  return {
    charges,
    async createPaymentSource() {
      return { id: "777", label: "VISA •••• 4242" };
    },
    async charge(_keys, input) {
      charges.push(input.reference);
      return {
        id: `tx-${charges.length}`,
        reference: input.reference,
        status: statuses[Math.min(charges.length - 1, statuses.length - 1)],
        amountInCents: input.amountInCents,
        createdAt: new Date().toISOString(),
      };
    },
  };
}

describe.skipIf(!testDatabaseUrl)("suscripción (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  const profile = {
    legalName: "Club Prueba SAS",
    documentType: "NIT",
    documentNumber: "900123456-7",
    address: "Calle 10 # 20-30, Medellín",
    billingEmail: "pagos@club.co",
  };
  const state = (schoolId: string) =>
    runInTenant(conn.db, { schoolId }, async (tx) => ({
      school: (await tx.select().from(schools).where(eq(schools.id, schoolId)))[0],
      sub: (await tx.select().from(subscriptions).where(eq(subscriptions.schoolId, schoolId)))[0],
      invoices: await tx.select().from(platformInvoices),
    }));

  it("paga con link: pide datos de facturación, crea la cuenta y el webhook la activa", async () => {
    const f = await schoolFixture(conn.db);
    const now = new Date("2026-10-08T15:00:00Z");
    const deps = {
      provider: wompiProvider(),
      keys: KEYS,
      returnUrl: (r: string) => `https://app/x?ref=${r}`,
    };
    expect(await startCheckout(conn.db, f.ctx, { planCode: "club", interval: "MONTHLY" }, deps, now)).toEqual(
      {
        ok: false,
        error: "billing_profile",
      },
    );
    expect((await saveBillingProfile(conn.db, f.ctx, { ...profile, billingEmail: "x" })).ok).toBe(false);
    expect((await saveBillingProfile(conn.db, f.ctx, profile)).ok).toBe(true);
    expect(
      await startCheckout(
        conn.db,
        f.ctx,
        { planCode: "club", interval: "MONTHLY" },
        { ...deps, keys: null },
        now,
      ),
    ).toEqual({ ok: false, error: "not_configured" });

    const checkout = await startCheckout(conn.db, f.ctx, { planCode: "club", interval: "ANNUAL" }, deps, now);
    if (!checkout.ok) throw new Error(checkout.error);
    expect(checkout.url).toContain(`reference=${checkout.reference}`);
    expect(checkout.url).toContain(`amount-in-cents=${priceOf(PLANS[1], "ANNUAL") * 100}`);

    const mailer = consoleMailer({ quiet: true });
    const event = signedTestEvent(
      {
        id: "w-1",
        reference: checkout.reference,
        status: "APPROVED",
        amount_in_cents: priceOf(PLANS[1], "ANNUAL") * 100,
      },
      KEYS.eventsSecret,
    );
    expect(
      await handlePodiumEvent(conn.db, wompiProvider(), KEYS, signedTestEvent({ id: "z" }, "otro"), now),
    ).toBe("invalid");
    expect(await handlePodiumEvent(conn.db, wompiProvider(), KEYS, event, now, mailer)).toBe("paid");
    expect(await handlePodiumEvent(conn.db, wompiProvider(), KEYS, event, now, mailer)).toBe("ignored");
    const s = await state(f.ctx.schoolId);
    expect(s.school.status).toBe("ACTIVE");
    expect(s.sub).toMatchObject({ status: "ACTIVE", planCode: "club", interval: "ANNUAL", method: "LINK" });
    expect(s.sub.currentPeriodEnd?.toISOString()).toBe("2027-10-08T04:59:00.000Z");
    expect(mailer.sent[0].subject).toBe("Recibimos tu pago de Podium");

    const view = await getSubscription(conn.db, f.ctx.schoolId);
    expect(view).toMatchObject({ profileComplete: true, activeAthletes: 0, overLimit: false });
  });

  it("tarjeta: cobro automático, renovación, mora con reintentos, solo lectura y cancelación", async () => {
    const f = await schoolFixture(conn.db);
    await saveBillingProfile(conn.db, f.ctx, profile);
    const mailer = consoleMailer({ quiet: true });
    const day = (d: string) => new Date(`${d}T14:00:00Z`);

    const cards = fakeCards(["APPROVED", "DECLINED"]);
    const deps = { cardApi: cards, keys: KEYS, mailer, appUrl: "https://app" };
    const subscribed = await subscribeWithCard(
      conn.db,
      f.ctx,
      { cardToken: "tok_test", planCode: "semilla", interval: "MONTHLY" },
      deps,
      day("2026-10-08"),
    );
    expect(subscribed).toEqual({ ok: true, result: "paid" });
    let s = await state(f.ctx.schoolId);
    expect(s.sub).toMatchObject({ method: "CARD", paymentSourceId: "777", cardLabel: "VISA •••• 4242" });

    const school = { id: f.ctx.schoolId, slug: f.school.slug };
    // Antes del fin del periodo no pasa nada.
    expect(await runSubscriptionJob(conn.db, school, day("2026-10-20"), deps)).toBe(0);
    // Último día del periodo: crea la renovación y cobra (rechazada).
    expect(await runSubscriptionJob(conn.db, school, day("2026-11-07"), deps)).toBe(1);
    expect(cards.charges).toHaveLength(2);
    // Día siguiente: en mora.
    await runSubscriptionJob(conn.db, school, day("2026-11-08"), deps);
    s = await state(f.ctx.schoolId);
    expect(s.school.status).toBe("PAST_DUE");
    // Reintento el día 1 de mora (una sola vez ese día).
    await runSubscriptionJob(conn.db, school, day("2026-11-09"), deps);
    await runSubscriptionJob(conn.db, school, day("2026-11-09"), deps);
    expect(cards.charges).toHaveLength(3);
    // Sin reintento el día 2.
    await runSubscriptionJob(conn.db, school, day("2026-11-10"), deps);
    expect(cards.charges).toHaveLength(3);
    // A los 7 días: solo lectura.
    await runSubscriptionJob(conn.db, school, day("2026-11-15"), deps);
    s = await state(f.ctx.schoolId);
    expect(s.school.status).toBe("READ_ONLY");
    // 60 días después: cancelada.
    await runSubscriptionJob(conn.db, school, day("2027-01-15"), deps);
    s = await state(f.ctx.schoolId);
    expect(s.school.status).toBe("CANCELED");
    expect(mailer.sent.map((m) => m.subject)).toEqual(
      expect.arrayContaining(["No pudimos cobrar tu suscripción", `${s.school.name} pasó a solo lectura`]),
    );
  });

  it("prueba vencida pasa a solo lectura; cancelar en prueba es inmediato", async () => {
    const f = await schoolFixture(conn.db);
    const deps = {
      cardApi: fakeCards(["APPROVED"]),
      keys: KEYS,
      mailer: consoleMailer({ quiet: true }),
      appUrl: "x",
    };
    const school = { id: f.ctx.schoolId, slug: f.school.slug };
    expect(await runSubscriptionJob(conn.db, school, new Date(), deps)).toBe(0);
    expect(await runSubscriptionJob(conn.db, school, new Date(Date.now() + 31 * 86_400_000), deps)).toBe(1);
    expect((await state(f.ctx.schoolId)).school.status).toBe("READ_ONLY");

    const g = await schoolFixture(conn.db);
    const canceled = await cancelSubscription(conn.db, g.ctx, "Muy caro", new Date());
    expect(canceled.immediate).toBe(true);
    expect((await state(g.ctx.schoolId)).school.status).toBe("CANCELED");
  });

  it("limpia la marca de límite superado cuando vuelve a estar dentro del plan", async () => {
    const f = await schoolFixture(conn.db);
    await saveBillingProfile(conn.db, f.ctx, profile);
    const cards = fakeCards(["APPROVED"]);
    const mailer = consoleMailer({ quiet: true });
    const deps = { cardApi: cards, keys: KEYS, mailer, appUrl: "https://app" };
    await subscribeWithCard(
      conn.db,
      f.ctx,
      { cardToken: "t", planCode: "semilla", interval: "MONTHLY" },
      deps,
      new Date("2026-10-08T14:00:00Z"),
    );
    // Marca de límite superado puesta antes (p. ej. tras retirar alumnos ya no aplica).
    for (let i = 0; i < 3; i++) await f.athlete(`A${i}`);
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx
        .update(subscriptions)
        .set({ overLimitSince: new Date("2026-10-20T14:00:00Z"), planCode: "semilla" })
        .where(eq(subscriptions.schoolId, f.ctx.schoolId)),
    );
    // Con pocos alumnos ya no supera el límite: se limpia la marca.
    await runSubscriptionJob(
      conn.db,
      { id: f.ctx.schoolId, slug: f.school.slug },
      new Date("2026-10-21T14:00:00Z"),
      deps,
    );
    expect((await state(f.ctx.schoolId)).sub.overLimitSince).toBeNull();
  });
});
