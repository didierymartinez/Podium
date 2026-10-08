import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { schools } from "@/db/schema";
import { consoleMailer } from "@/lib/mailer/console";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { sendTrialEmails, welcomeEmail } from "./emails";

describe("correos de onboarding", () => {
  it("bienvenida con el link de la escuela", () => {
    const mail = welcomeEmail({
      ownerName: "Ana Restrepo",
      schoolName: "Club Ruedas",
      url: "https://x/club",
      trialDays: 30,
    });
    expect(mail.subject).toBe("¡Bienvenido(a) a Podium, Ana!");
    expect(mail.html).toContain("https://x/club");
  });
});

describe.skipIf(!testDatabaseUrl)("secuencia de la prueba (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("envía el correo del día 3 una sola vez y nada los demás días", async () => {
    const f = await schoolFixture(conn.db);
    const created = new Date(Date.now() - 3 * 86_400_000 - 3_600_000);
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.update(schools).set({ createdAt: created }).where(eq(schools.id, f.ctx.schoolId)),
    );
    const mailer = consoleMailer({ quiet: true });
    expect(await sendTrialEmails(conn.db, mailer, f.school, new Date(), "http://test")).toBe(1);
    expect(await sendTrialEmails(conn.db, mailer, f.school, new Date(), "http://test")).toBe(0);
    expect(mailer.sent[0]).toMatchObject({
      to: f.owner.email,
      subject: "¿Ya tomaste asistencia desde el celular?",
    });
    expect(
      await sendTrialEmails(conn.db, mailer, f.school, new Date(Date.now() + 86_400_000), "http://test"),
    ).toBe(0);
  });
});
