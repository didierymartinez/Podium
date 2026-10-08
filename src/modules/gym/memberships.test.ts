import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { disciplines, schools } from "@/db/schema";
import { getInvoice } from "@/modules/billing/invoices";
import { DEFAULT_BILLING_POLICY as policy } from "@/modules/billing/policy";
import { createSchool } from "@/modules/schools/create-school";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { createMember, createPlan, gymCheckIn, listMembers, sellMembership } from "./memberships";

describe.skipIf(!testDatabaseUrl)("Podium Gym: membresías e ingresos (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("gimnasio con plantilla de entrenamiento, ticketera, periodo, renovación e ingresos", async () => {
    const owner = await createTestUser(conn.db, "owner");
    const created = await createSchool(conn.db, owner.id, {
      name: "Estudio Fuerza",
      slug: `t-${crypto.randomUUID().slice(0, 8)}`,
      city: "Bogotá",
      discipline: "speed",
      estimatedStudents: "1-30",
      type: "GYM",
    });
    if (!created.ok) throw new Error("gym");
    const ctx = { schoolId: created.schoolId, actorUserId: owner.id, slug: created.slug };
    const setup = await runInTenant(conn.db, { schoolId: ctx.schoolId }, async (tx) => ({
      school: (await tx.select().from(schools).where(eq(schools.id, ctx.schoolId)))[0],
      disciplines: await tx.select().from(disciplines),
    }));
    expect(setup.school.type).toBe("GYM");
    expect(setup.disciplines.map((d) => [d.sport, d.code])).toEqual([["FITNESS", "fitness"]]);

    const today = "2026-10-08";
    const member = await createMember(
      conn.db,
      ctx,
      { firstName: "Carlos", lastName: "Mejía", birthDate: "1990-02-01", phone: "3105556677", email: "" },
      today,
    );
    const pack = await createPlan(conn.db, ctx, {
      name: "Ticketera 2",
      kind: "VISITS",
      days: 30,
      visits: 2,
      price: 50_000,
    });
    const month = await createPlan(conn.db, ctx, {
      name: "Mensual",
      kind: "PERIOD",
      days: 30,
      visits: null,
      price: 120_000,
    });
    if (!pack.ok || !month.ok) throw new Error("plans");

    expect(await gymCheckIn(conn.db, ctx, member, today, "reception")).toEqual({
      ok: false,
      error: "no_membership",
    });
    const sold = await sellMembership(conn.db, ctx, { athleteId: member, planId: pack.id }, today, policy);
    expect(sold).toMatchObject({ ok: true, startsOn: today, endsOn: "2026-11-06" });
    if (!sold.ok) throw new Error("sale");
    expect((await getInvoice(conn.db, ctx.schoolId, sold.invoiceId!))?.invoice.total).toBe(50_000);

    expect(await gymCheckIn(conn.db, ctx, member, today, "reception")).toMatchObject({
      ok: true,
      already: false,
      membership: { visitsLeft: 1 },
    });
    // Mismo día: no descuenta otra visita.
    expect(await gymCheckIn(conn.db, ctx, member, today, "self")).toMatchObject({
      ok: true,
      already: true,
      membership: { visitsLeft: 1 },
    });
    expect(await gymCheckIn(conn.db, ctx, member, "2026-10-09", "self")).toMatchObject({
      ok: true,
      membership: { visitsLeft: 0 },
    });
    expect(await gymCheckIn(conn.db, ctx, member, "2026-10-10", "self")).toEqual({
      ok: false,
      error: "no_membership",
    });

    // Renovación: la mensual empieza al terminar la ticketera.
    const renewed = await sellMembership(
      conn.db,
      ctx,
      { athleteId: member, planId: month.id },
      "2026-10-10",
      policy,
    );
    expect(renewed).toMatchObject({ ok: true, startsOn: "2026-11-07", endsOn: "2026-12-06" });

    const [row] = await listMembers(conn.db, ctx.schoolId, "2026-12-01");
    expect(row).toMatchObject({
      name: "Carlos Mejía",
      current: { planName: "Mensual", endsOn: "2026-12-06", visitsLeft: null },
      lastCheckIn: "2026-10-09",
      expiring: true,
      inactive: true,
    });
  });
});
