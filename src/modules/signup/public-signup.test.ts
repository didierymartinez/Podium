import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { enrollments, notifications } from "@/db/schema";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { publicSignupInfo, submitSignup, trialDates, updateSignupSettings } from "./public-signup";

describe("clase de prueba: fechas", () => {
  it("toma los días del horario dentro de la ventana", () => {
    // 2026-10-08 es jueves (índice 3); lunes = 0.
    expect(trialDates([{ weekday: 0 }], "2026-10-08", 14)).toEqual(["2026-10-12", "2026-10-19"]);
  });
});

describe.skipIf(!testDatabaseUrl)("pre-inscripción pública (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("solo con el formulario activo; crea al alumno preinscrito y avisa a la administración", async () => {
    const f = await schoolFixture(conn.db);
    const school = { id: f.ctx.schoolId, slug: f.school.slug };
    expect(await publicSignupInfo(conn.db, school.id, f.today)).toBeNull();

    await updateSignupSettings(conn.db, f.ctx, { enabled: true, intro: "Ven a probar" });
    const info = await publicSignupInfo(conn.db, school.id, f.today);
    expect(info?.intro).toBe("Ven a probar");
    const group = info!.groups.find((g) => g.id === f.group.id)!;
    expect(group.dates.length).toBeGreaterThan(0);

    const base = {
      athleteFirstName: "Emilia",
      athleteLastName: "Ríos",
      birthDate: "2016-04-02",
      guardianFirstName: "Carolina",
      guardianLastName: "Ríos",
      phone: "300 555 1212",
      email: "",
      groupId: group.id,
      trialDate: group.dates[0],
      dataConsent: true as const,
    };
    expect(
      await submitSignup(conn.db, school, { ...base, trialDate: "2020-01-01" }, { today: f.today, ip: null }),
    ).toEqual({
      ok: false,
      error: "date_unavailable",
    });
    const result = await submitSignup(conn.db, school, base, { today: f.today, ip: "203.0.113.9" });
    expect(result).toMatchObject({ ok: true, trialDate: group.dates[0], groupName: "Iniciación" });
    if (!result.ok) throw new Error("signup");

    const [enrollment] = await runInTenant(conn.db, { schoolId: school.id }, (tx) =>
      tx.select().from(enrollments).where(eq(enrollments.athleteId, result.athleteId)),
    );
    expect(enrollment).toMatchObject({
      status: "PRE_ENROLLED",
      startDate: group.dates[0],
      groupId: group.id,
    });
    const inbox = await runInTenant(conn.db, { schoolId: school.id }, (tx) =>
      tx.select().from(notifications).where(eq(notifications.kind, "signup.submitted")),
    );
    expect(inbox.map((n) => n.userId)).toContain(f.owner.id);

    await updateSignupSettings(conn.db, f.ctx, { enabled: false, intro: "" });
    expect(await submitSignup(conn.db, school, base, { today: f.today, ip: null })).toEqual({
      ok: false,
      error: "closed",
    });
  });
});
