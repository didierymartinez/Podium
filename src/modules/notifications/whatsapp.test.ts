import { createHmac } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { guardians, legalAcceptances, notifications, schools } from "@/db/schema";
import { consoleMailer } from "@/lib/mailer/console";
import { templateParam, waNumber } from "@/lib/whatsapp-cloud/cloud";
import type { TemplateMessage, WhatsAppSender } from "@/lib/whatsapp-cloud/types";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { deliverPending, withinMessagingHours } from "./delivery";
import { notifyUsers } from "./notify";
import { handleWhatsAppWebhook, validSignature } from "./whatsapp-webhook";

function fakeSender() {
  const templates: TemplateMessage[] = [];
  const texts: { to: string; body: string }[] = [];
  const sender: WhatsAppSender = {
    async sendTemplate(m) {
      templates.push(m);
      return { ok: true, id: `wamid.${templates.length}` };
    },
    async sendText(to, body) {
      texts.push({ to, body });
      return { ok: true, id: `wamid.text.${texts.length}` };
    },
  };
  return { sender, templates, texts };
}

describe("whatsapp: utilidades", () => {
  it("valida la firma de Meta", () => {
    const body = '{"a":1}';
    const sig = `sha256=${createHmac("sha256", "secreto").update(body).digest("hex")}`;
    expect(validSignature(body, sig, "secreto")).toBe(true);
    expect(validSignature(body, sig, "otro")).toBe(false);
    expect(validSignature(body, null, "secreto")).toBe(false);
  });
  it("normaliza números y parámetros de plantilla", () => {
    expect(waNumber("+573001234567")).toBe("573001234567");
    expect(waNumber("3001234567")).toBe("573001234567");
    expect(waNumber("6041234567")).toBeNull();
    expect(templateParam("Hola\n\nmundo    feliz")).toBe("Hola mundo   feliz");
    expect(templateParam("x".repeat(10), 5)).toBe("xxxx…");
  });
  it("horario permitido de 7 a. m. a 8 p. m.", () => {
    expect(withinMessagingHours(new Date("2026-10-08T15:00:00Z"), "America/Bogota")).toBe(true); // 10:00
    expect(withinMessagingHours(new Date("2026-10-09T02:00:00Z"), "America/Bogota")).toBe(false); // 21:00
  });
});

describe.skipIf(!testDatabaseUrl)("whatsapp automático (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("cascada con consentimiento, horario, estados por webhook y baja con SALIR", async () => {
    const f = await schoolFixture(conn.db);
    await f.athlete("Sofía", { guardianPhone: "3009876543" });
    const parent = await createTestUser(conn.db, "acudiente");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      await tx.update(schools).set({ commsEnabledAt: new Date() }).where(eq(schools.id, f.ctx.schoolId));
      const [first] = await tx.select().from(guardians).orderBy(asc(guardians.createdAt));
      await tx.update(guardians).set({ userId: parent.id }).where(eq(guardians.id, first.id));
    });
    const notify = (title: string, kind = "announcement") =>
      runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
        notifyUsers(tx, f.ctx.schoolId, [parent.id], { kind, title, body: "Detalle", href: "/x" }),
      );
    const mailer = consoleMailer({ quiet: true });
    const wa = fakeSender();
    const channels = {
      mailer,
      notifier: null,
      appUrl: "https://podium.test",
      whatsapp: { sender: wa.sender, template: { name: "aviso_podium", language: "es" } },
    };
    const day = new Date("2026-10-08T15:00:00Z"); // 10 a. m. en Bogotá
    const night = new Date("2026-10-09T02:00:00Z"); // 9 p. m.

    // Sin consentimiento de WhatsApp: correo.
    await notify("Primero");
    expect(await deliverPending(conn.db, channels, f.ctx.schoolId, day)).toBe(1);
    expect(wa.templates).toHaveLength(0);
    expect(mailer.sent).toHaveLength(1);

    await conn.db
      .insert(legalAcceptances)
      .values({ userId: parent.id, schoolId: f.ctx.schoolId, document: "WHATSAPP", version: "2026-10" });

    // De noche lo no urgente espera; una clase cancelada sale de inmediato.
    await notify("Aviso nocturno");
    await notify("Clase cancelada", "session.canceled");
    expect(await deliverPending(conn.db, channels, f.ctx.schoolId, night)).toBe(1);
    expect(wa.templates.map((t) => t.params[1])).toEqual(["Clase cancelada. Detalle"]);
    expect(wa.templates[0]).toMatchObject({
      to: "573009876543",
      template: "aviso_podium",
      params: [expect.any(String), "Clase cancelada. Detalle", "https://podium.test/x"],
    });
    // En la mañana sale el que esperaba.
    expect(await deliverPending(conn.db, channels, f.ctx.schoolId, day)).toBe(1);
    expect(wa.templates).toHaveLength(2);

    // Estados de Meta: entregado → leído, sin retroceder.
    const status = (id: string, s: string) => ({
      entry: [{ changes: [{ value: { statuses: [{ id, status: s }] } }] }],
    });
    expect((await handleWhatsAppWebhook(conn.db, status("wamid.1", "delivered"), null)).statuses).toBe(1);
    expect((await handleWhatsAppWebhook(conn.db, status("wamid.1", "read"), null)).statuses).toBe(1);
    expect((await handleWhatsAppWebhook(conn.db, status("wamid.1", "delivered"), null)).statuses).toBe(0);
    const [row] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(notifications).where(eq(notifications.whatsappMessageId, "wamid.1")),
    );
    expect(row).toMatchObject({ deliveredVia: "whatsapp", whatsappStatus: "read" });

    // "SALIR" retira el consentimiento y responde; lo siguiente va por correo.
    const salir = {
      entry: [
        {
          changes: [
            { value: { messages: [{ from: "573009876543", type: "text", text: { body: " salir " } }] } },
          ],
        },
      ],
    };
    expect(await handleWhatsAppWebhook(conn.db, salir, wa.sender)).toEqual({
      statuses: 0,
      optOuts: 1,
      replies: 1,
    });
    await notify("Después de la baja");
    expect(await deliverPending(conn.db, channels, f.ctx.schoolId, day)).toBe(1);
    expect(wa.templates).toHaveLength(2);
    expect(mailer.sent.map((m) => m.subject)).toEqual(["Primero", "Después de la baja"]);
  });
});
