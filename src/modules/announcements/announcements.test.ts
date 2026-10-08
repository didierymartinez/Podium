import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asPortalUser } from "@/db/portal";
import { runInTenant } from "@/db/rls";
import { guardians, notifications, schools, users } from "@/db/schema";
import { consoleMailer } from "@/lib/mailer/console";
import type { Notifier } from "@/lib/notifier/types";
import { listGuardians } from "@/modules/athletes/guardians";
import { generateMonth, getInvoice, listInvoices } from "@/modules/billing/invoices";
import { DEFAULT_BILLING_POLICY } from "@/modules/billing/policy";
import { registerPushToken, deliverPending } from "@/modules/notifications/delivery";
import { exportMyData } from "@/modules/portal/privacy";
import { setCommsEnabled } from "@/modules/schools/comms";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { randomMobile, schoolFixture } from "@/test/fixtures";
import {
  createAnnouncement,
  getAnnouncement,
  nextAllowedTime,
  receivedAnnouncements,
  renderMessage,
  sendScheduledAnnouncements,
} from "./announcements";

describe("avisos: utilidades", () => {
  it("reemplaza variables por persona", () => {
    expect(
      renderMessage(
        "Hola {acudiente}, {alumnos} ({grupo}) — {escuela}",
        { name: "Laura Gómez", athletes: ["Sofía", "Tomás"], groups: ["Iniciación"] },
        "Club X",
      ),
    ).toBe("Hola Laura, Sofía, Tomás (Iniciación) — Club X");
  });
  it("programa fuera del horario de 7 a. m. a 8 p. m.", () => {
    expect(nextAllowedTime(new Date("2026-10-08T15:00:00Z"), "America/Bogota")).toBeNull(); // 10:00
    expect(nextAllowedTime(new Date("2026-10-09T02:00:00Z"), "America/Bogota")?.toISOString()).toBe(
      "2026-10-09T12:00:00.000Z",
    ); // 21:00 → 7:00
    expect(nextAllowedTime(new Date("2026-10-08T10:00:00Z"), "America/Bogota")?.toISOString()).toBe(
      "2026-10-08T12:00:00.000Z",
    ); // 5:00 → 7:00
  });
});

describe.skipIf(!testDatabaseUrl)("avisos, entrega y portal (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  async function setup() {
    const f = await schoolFixture(conn.db, "Club Avisos");
    const phone = randomMobile("30");
    await f.athlete("Sofía", { guardianPhone: phone, startDate: "2026-09-01" });
    await f.athlete("Tomás", { guardianPhone: phone, startDate: "2026-09-01" });
    await f.athlete("Pedro", { startDate: "2026-09-01" });
    const all = await listGuardians(conn.db, f.ctx.schoolId);
    const laura = all.find((g) => g.athletes.length === 2)!;
    const other = all.find((g) => g.athletes.length === 1)!;
    const lauraUser = await createTestUser(conn.db, "laura");
    const otherUser = await createTestUser(conn.db, "otra");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      await tx.update(guardians).set({ userId: lauraUser.id }).where(eq(guardians.id, laura.id));
      await tx.update(guardians).set({ userId: otherUser.id }).where(eq(guardians.id, other.id));
    });
    const author = {
      schoolId: f.ctx.schoolId,
      actorUserId: f.owner.id,
      slug: f.school.slug,
      schoolName: "Club Avisos",
      timeZone: "America/Bogota",
      isManager: true,
    };
    return { f, laura, other, lauraUser, otherUser, author };
  }

  it("deduplica familias, personaliza, respeta el horario y guarda el historial", async () => {
    const { f, laura, lauraUser, author } = await setup();
    const morning = new Date("2026-10-08T15:00:00Z");
    const sent = await createAnnouncement(
      conn.db,
      author,
      {
        title: "Mañana no hay clase",
        body: "Hola {acudiente}, {alumnos} descansa.",
        audience: { kind: "school", ids: [] },
        pinnedUntil: "2026-10-20",
      },
      morning,
    );
    if (!sent.ok) throw new Error(sent.error);
    const detail = await getAnnouncement(conn.db, f.ctx.schoolId, sent.announcementId);
    expect(detail?.recipients).toHaveLength(2);
    expect(detail?.recipients.find((r) => r.guardianId === laura.id)?.message).toBe(
      "Hola Laura, Sofía, Tomás descansa.",
    );
    expect(await receivedAnnouncements(conn.db, f.ctx.schoolId, { guardianId: laura.id })).toHaveLength(1);
    const inbox = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(notifications).where(eq(notifications.userId, lauraUser.id)),
    );
    expect(inbox.map((n) => n.kind)).toContain("announcement");

    // Fuera de horario: queda programado y lo envía la tarea.
    const night = new Date("2026-10-09T02:00:00Z");
    const later = await createAnnouncement(
      conn.db,
      author,
      { title: "Torneo", body: "Hola {acudiente}", audience: { kind: "groups", ids: [f.group.id] } },
      night,
    );
    if (!later.ok) throw new Error(later.error);
    expect(later.scheduledFor?.toISOString()).toBe("2026-10-09T12:00:00.000Z");
    expect(await sendScheduledAnnouncements(conn.db, f.school, new Date("2026-10-09T11:00:00Z"))).toBe(0);
    expect(await sendScheduledAnnouncements(conn.db, f.school, new Date("2026-10-09T12:01:00Z"))).toBe(1);

    // Profesor: solo a sus grupos.
    const asCoach = await createAnnouncement(
      conn.db,
      { ...author, actorUserId: f.coachUser.id, isManager: false },
      { title: "Traer casco", body: "Hola", audience: { kind: "school", ids: [] } },
      morning,
    );
    expect(asCoach.ok).toBe(true);
    if (asCoach.ok)
      expect(
        (await getAnnouncement(conn.db, f.ctx.schoolId, asCoach.announcementId))?.announcement.audience,
      ).toEqual({
        kind: "groups",
        ids: [f.group.id],
      });
  });

  it("entrega por push o correo según preferencias y solo al equipo hasta activar comunicaciones", async () => {
    const { f, lauraUser, otherUser, author } = await setup();
    await conn.db
      .update(users)
      .set({ notificationPrefs: { notices: { push: false, email: true } } })
      .where(eq(users.id, otherUser.id));
    const pushes: string[] = [];
    const notifier: Notifier = {
      send: async (token) => (pushes.push(token), token === "dead" ? "invalid_token" : "sent"),
    };
    const mailer = consoleMailer({ quiet: true });
    await registerPushToken(conn.db, lauraUser.id, "token-laura-123456789012", "test");
    await registerPushToken(conn.db, otherUser.id, "token-otra-1234567890123", "test");

    await createAnnouncement(conn.db, author, {
      title: "Aviso",
      body: "Hola {acudiente}",
      audience: { kind: "school", ids: [] },
      urgent: true,
    });
    // Sin activar comunicaciones: a las familias no se les envía nada.
    expect(await deliverPending(conn.db, { mailer, notifier, appUrl: "http://test" }, f.ctx.schoolId)).toBe(
      0,
    );
    expect(pushes).toHaveLength(0);

    await setCommsEnabled(conn.db, f.ctx, true);
    await createAnnouncement(conn.db, author, {
      title: "Segundo",
      body: "Hola {acudiente}",
      audience: { kind: "school", ids: [] },
      urgent: true,
    });
    expect(await deliverPending(conn.db, { mailer, notifier, appUrl: "http://test" }, f.ctx.schoolId)).toBe(
      2,
    );
    // Laura por push; la otra acudiente apagó push de avisos: le llega por correo.
    expect(pushes).toEqual(["token-laura-123456789012"]);
    expect(mailer.sent.map((m) => m.to)).toEqual([otherUser.email]);
    expect(mailer.sent[0].html).toContain("Segundo");
    expect(await deliverPending(conn.db, { mailer, notifier, appUrl: "http://test" }, f.ctx.schoolId)).toBe(
      0,
    );
  });

  it("RLS de familia: cada acudiente ve solo lo suyo aunque la consulta pida más", async () => {
    const { f, laura, other, lauraUser, otherUser } = await setup();
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.update(schools).set({ commsEnabledAt: new Date() }).where(eq(schools.id, f.ctx.schoolId)),
    );
    await generateMonth(
      conn.db,
      { ...f.ctx, slug: f.school.slug },
      "2026-10",
      "2026-10-01",
      DEFAULT_BILLING_POLICY,
    );
    const allInvoices = await listInvoices(conn.db, f.ctx.schoolId, { today: "2026-10-01" });
    expect(allInvoices).toHaveLength(2);
    const lauraView = await asPortalUser(lauraUser.id, async () => ({
      guardians: await listGuardians(conn.db, f.ctx.schoolId),
      invoices: await listInvoices(conn.db, f.ctx.schoolId, { today: "2026-10-01" }),
      foreign: await getInvoice(
        conn.db,
        f.ctx.schoolId,
        allInvoices.find((i) => i.guardianId === other.id)!.id,
      ),
    }));
    expect(lauraView.guardians.map((g) => g.id)).toEqual([laura.id]);
    expect(lauraView.invoices.map((i) => i.guardianId)).toEqual([laura.id]);
    expect(lauraView.foreign).toBeNull();

    const data = await asPortalUser(otherUser.id, () => exportMyData(conn.db, f.ctx.schoolId, otherUser.id));
    expect(data.athletes.map((a) => a.firstName)).toEqual(["Pedro"]);
    // Sin contexto de familia (administración) se ve todo.
    expect(await listGuardians(conn.db, f.ctx.schoolId)).toHaveLength(2);
  });
});
