import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asPortalUser } from "@/db/portal";
import { runInTenant } from "@/db/rls";
import { ageCategories, documentTypes, guardians } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { listInvoices } from "@/modules/billing/invoices";
import { DEFAULT_BILLING_POLICY } from "@/modules/billing/policy";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import {
  athleteCompetitions,
  candidates,
  chargeEntry,
  createCompetition,
  familyInvitations,
  importResults,
  inviteAthletes,
  medalTable,
  registrationSheet,
  respondToInvitation,
  saveResult,
  travelList,
} from "./competitions";
import { DEFAULT_AUTHORIZATION } from "./labels";

describe.skipIf(!testDatabaseUrl)("competencias (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("convoca con validaciones, la familia acepta con autorización y cobro, y se registran resultados", async () => {
    const f = await schoolFixture(conn.db);
    const ctx = { ...f.ctx, slug: f.school.slug };
    const startsOn = addDays(f.today, 30);
    const season = Number(startsOn.slice(0, 4));
    const sofia = await f.athlete("Sofía", { birthDate: `${season - 11}-03-14` });
    const ana = await f.athlete("Ana", { birthDate: `${season - 16}-05-01` });
    const parent = await createTestUser(conn.db, "acudiente");
    const { infantil, docType } = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      const [first] = await tx.select().from(guardians).orderBy(asc(guardians.createdAt));
      await tx.update(guardians).set({ userId: parent.id }).where(eq(guardians.id, first.id));
      const [infantil] = await tx.select().from(ageCategories).where(eq(ageCategories.name, "Infantil"));
      const [docType] = await tx.select().from(documentTypes).orderBy(asc(documentTypes.position));
      return { infantil, docType };
    });

    const competitionId = await createCompetition(conn.db, f.ctx, {
      name: "Válida departamental",
      kind: "LEAGUE",
      startsOn,
      endsOn: addDays(startsOn, 2),
      city: "Cali",
      venue: "Patinódromo",
      registrationDeadline: addDays(f.today, 10),
      events: ["500 m", "1.000 m"],
      entryFee: 80_000,
      extras: [
        { name: "Transporte", amount: 120_000 },
        { name: "Hospedaje", amount: 200_000 },
      ],
      categoryIds: [infantil.id],
      requireNoDebt: true,
      requiredDocumentTypeIds: [docType.id],
      authorizationText: DEFAULT_AUTHORIZATION,
    });

    const list = await candidates(conn.db, f.ctx.schoolId, competitionId, f.group.id, f.today);
    expect(list.find((c) => c.id === sofia)?.issues).toEqual([`Falta ${docType.name}`]);
    expect(list.find((c) => c.id === ana)?.issues).toEqual([
      expect.stringMatching(/^Categoría .* no admitida$/),
      `Falta ${docType.name}`,
    ]);

    // Sin forzar no convoca a nadie con observaciones; forzando, Sofía queda con el aviso.
    const strict = await inviteAthletes(
      conn.db,
      ctx,
      competitionId,
      { athleteIds: [sofia, ana], events: ["500 m"], force: false },
      f.today,
    );
    expect(strict).toMatchObject({ ok: true, invited: 0 });
    expect(
      await inviteAthletes(
        conn.db,
        ctx,
        competitionId,
        { athleteIds: [sofia], events: ["500 m", "1.000 m"], force: true },
        f.today,
      ),
    ).toEqual({ ok: true, invited: 1, skipped: [] });
    expect(
      await inviteAthletes(
        conn.db,
        ctx,
        competitionId,
        { athleteIds: [sofia], events: ["Maratón"], force: true },
        f.today,
      ),
    ).toEqual({ ok: false, error: "invalid_events" });

    // La familia ve solo su convocatoria y acepta con autorización.
    const invitations = await asPortalUser(parent.id, () =>
      familyInvitations(conn.db, f.ctx.schoolId, f.today),
    );
    expect(invitations).toHaveLength(1);
    const entryId = invitations[0].entry.id;
    const meta = { ip: "203.0.113.5", now: new Date(), today: f.today };
    expect(
      await asPortalUser(parent.id, () =>
        respondToInvitation(
          conn.db,
          f.ctx.schoolId,
          parent.id,
          entryId,
          { accept: true, extras: [], authorized: false },
          meta,
        ),
      ),
    ).toEqual({ ok: false, error: "not_authorized" });
    expect(
      await asPortalUser(parent.id, () =>
        respondToInvitation(
          conn.db,
          f.ctx.schoolId,
          parent.id,
          entryId,
          { accept: true, extras: ["Transporte", "Inventado"], authorized: true },
          meta,
        ),
      ),
    ).toEqual({ ok: true, entryId, accepted: true });
    const invoiceId = await chargeEntry(conn.db, ctx, entryId, f.today, DEFAULT_BILLING_POLICY);
    expect(invoiceId).toBeTruthy();
    expect(await chargeEntry(conn.db, ctx, entryId, f.today, DEFAULT_BILLING_POLICY)).toBeNull();
    const invoices = await listInvoices(conn.db, f.ctx.schoolId, { today: f.today });
    expect(invoices.find((i) => i.id === invoiceId)?.total).toBe(200_000);

    const sheet = await registrationSheet(conn.db, f.ctx.schoolId, competitionId);
    expect(sheet?.rows).toEqual([
      expect.objectContaining({ name: "Sofía Gómez", category: "Infantil", events: "500 m, 1.000 m" }),
    ]);
    const travel = await travelList(conn.db, f.ctx.schoolId, competitionId);
    expect(travel?.rows[0]).toMatchObject({ name: "Sofía Gómez", extras: "Transporte" });
    expect(travel?.rows[0].guardians).toContain("Laura Gómez");

    expect(
      await saveResult(conn.db, ctx, entryId, { event: "500 m", position: 1, mark: "45,20", medal: "GOLD" }),
    ).toBe(true);
    const imported = await importResults(conn.db, ctx, competitionId, [
      ["Documento", "Nombre", "Prueba", "Posición", "Marca", "Medalla", "Observación"],
      ["", "sofia gomez", "1.000 m", "2", "1:35,10", "Plata", ""],
      ["", "Nadie Más", "500 m", "5", "", "", ""],
    ]);
    expect(imported).toEqual({ saved: 1, unmatched: ["Fila 3: Nadie Más"] });

    const medals = await medalTable(conn.db, f.ctx.schoolId, season);
    expect(medals.total).toEqual({ GOLD: 1, SILVER: 1, BRONZE: 0 });
    expect(medals.categories).toEqual([{ name: "Infantil", medals: { GOLD: 1, SILVER: 1, BRONZE: 0 } }]);

    const history = await asPortalUser(parent.id, () => athleteCompetitions(conn.db, f.ctx.schoolId, sofia));
    expect(history).toHaveLength(1);
    expect(history[0].results.map((r) => [r.event, r.medal]).sort()).toEqual([
      ["1.000 m", "SILVER"],
      ["500 m", "GOLD"],
    ]);
  });
});
