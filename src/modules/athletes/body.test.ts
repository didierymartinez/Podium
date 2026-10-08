import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asPortalUser } from "@/db/portal";
import { runInTenant } from "@/db/rls";
import { guardians } from "@/db/schema";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { bodyProfile, grantBodyConsent, recordMeasurement, revokeBodyConsent, saveAssessment } from "./body";

describe.skipIf(!testDatabaseUrl)("valoración inicial y composición corporal (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("las medidas exigen el permiso del acudiente y la familia ve solo lo suyo", async () => {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía");
    const ana = await f.athlete("Ana");
    const parent = await createTestUser(conn.db, "acudiente");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      const [first] = await tx.select().from(guardians).orderBy(asc(guardians.createdAt));
      await tx.update(guardians).set({ userId: parent.id }).where(eq(guardians.id, first.id));
    });

    expect(
      await saveAssessment(conn.db, f.ctx, sofia, {
        assessedOn: f.today,
        goals: "Competir en la válida",
        sportsBackground: "Natación dos años",
        healthHistory: "Asma leve",
        notes: "",
      }),
    ).toBe(true);
    const measurement = {
      measuredOn: f.today,
      source: "INBODY" as const,
      weightKg: 38.5,
      heightCm: 145,
      wingspanCm: null,
      skeletalMuscleKg: 15.2,
      bodyFatKg: null,
      bodyFatPercent: 18.4,
      visceralFat: null,
      bodyWaterKg: null,
      basalMetabolismKcal: 1150,
    };
    expect(await recordMeasurement(conn.db, f.ctx, sofia, measurement, f.today)).toEqual({
      ok: false,
      error: "no_consent",
    });

    // La familia da el permiso desde su portal.
    expect(
      await asPortalUser(parent.id, () =>
        grantBodyConsent(conn.db, f.ctx.schoolId, sofia, parent.id, "family", new Date()),
      ),
    ).toBe(true);
    expect(await recordMeasurement(conn.db, f.ctx, sofia, measurement, f.today)).toEqual({ ok: true });

    const staff = await bodyProfile(conn.db, f.ctx.schoolId, sofia, { includeHealth: true });
    expect(staff.assessment).toMatchObject({ goals: "Competir en la válida", healthHistory: "Asma leve" });
    expect(staff.consent?.source).toBe("family");
    expect(staff.measurements.map((m) => m.weightKg)).toEqual([38.5]);

    const family = await asPortalUser(parent.id, () =>
      bodyProfile(conn.db, f.ctx.schoolId, sofia, { includeHealth: false }),
    );
    expect(family.assessment?.healthHistory).toBeNull();
    expect(family.measurements).toHaveLength(1);
    // Otro alumno, otra familia: RLS no deja ver nada.
    const other = await asPortalUser(parent.id, () =>
      bodyProfile(conn.db, f.ctx.schoolId, ana, { includeHealth: false }),
    );
    expect(other).toEqual({ assessment: null, consent: null, measurements: [] });

    // Al retirar el permiso no se registran más medidas.
    await asPortalUser(parent.id, () =>
      revokeBodyConsent(conn.db, f.ctx.schoolId, sofia, parent.id, new Date()),
    );
    expect(await recordMeasurement(conn.db, f.ctx, sofia, measurement, f.today)).toEqual({
      ok: false,
      error: "no_consent",
    });
  });
});
