import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asPortalUser } from "@/db/portal";
import { runInTenant } from "@/db/rls";
import { guardians, notifications } from "@/db/schema";
import { listInvoices } from "@/modules/billing/invoices";
import { DEFAULT_BILLING_POLICY } from "@/modules/billing/policy";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { randomMobile, schoolFixture } from "@/test/fixtures";
import { confirmFamilyData, launchCampaign, listCampaigns, pendingConfirmations } from "./reenrollment";

describe.skipIf(!testDatabaseUrl)("re-matrícula anual (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("cobra una vez por año a cada familia y las familias confirman sus datos", async () => {
    const f = await schoolFixture(conn.db);
    const phone = randomMobile("30");
    await f.athlete("Sofía", { guardianPhone: phone });
    await f.athlete("Tomás", { guardianPhone: phone });
    await f.athlete("Otro");
    const ctx = { ...f.ctx, slug: f.school.slug };
    const parent = await createTestUser(conn.db, "acudiente");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      const [first] = await tx.select().from(guardians).orderBy(asc(guardians.createdAt));
      await tx.update(guardians).set({ userId: parent.id }).where(eq(guardians.id, first.id));
    });

    const launched = await launchCampaign(
      conn.db,
      ctx,
      { year: 2027, amount: 150_000, dueOn: "2027-01-31" },
      f.today,
      DEFAULT_BILLING_POLICY,
    );
    expect(launched).toEqual({ ok: true, athletes: 3, invoices: 2 });
    expect(
      await launchCampaign(
        conn.db,
        ctx,
        { year: 2027, amount: 1, dueOn: "2027-01-31" },
        f.today,
        DEFAULT_BILLING_POLICY,
      ),
    ).toEqual({ ok: false, error: "exists" });

    const all = await listInvoices(conn.db, f.ctx.schoolId, { today: f.today });
    expect(all.map((i) => i.total).sort()).toEqual([150_000, 300_000]);

    const inbox = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(notifications).where(eq(notifications.userId, parent.id)),
    );
    expect(inbox.map((n) => n.kind)).toEqual(expect.arrayContaining(["reenrollment", "invoice.created"]));

    // La familia solo ve y confirma las de sus hijos.
    const pending = await asPortalUser(parent.id, () => pendingConfirmations(conn.db, f.ctx.schoolId));
    expect(pending.map((p) => p.firstName).sort()).toEqual(["Sofía", "Tomás"]);
    expect(
      await asPortalUser(parent.id, () => confirmFamilyData(conn.db, f.ctx.schoolId, parent.id, new Date())),
    ).toBe(2);

    const [campaign] = await listCampaigns(conn.db, f.ctx.schoolId);
    expect(
      campaign.athletes
        .filter((a) => a.confirmed)
        .map((a) => a.name.split(" ")[0])
        .sort(),
    ).toEqual(["Sofía", "Tomás"]);
    expect(campaign.athletes.every((a) => !a.paid)).toBe(true);
  });
});
