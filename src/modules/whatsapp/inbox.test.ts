import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleWhatsAppWebhook } from "@/modules/notifications/whatsapp-webhook";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import {
  canReply,
  connectSchoolNumber,
  getSchoolNumber,
  listConversations,
  openConversation,
  replyToConversation,
} from "./inbox";

describe("ventana de respuesta", () => {
  it("permite texto libre hasta 24 h después del último mensaje del contacto", () => {
    const now = new Date("2026-10-08T15:00:00Z");
    expect(canReply(new Date("2026-10-07T16:00:00Z"), now)).toBe(true);
    expect(canReply(new Date("2026-10-07T14:00:00Z"), now)).toBe(false);
    expect(canReply(null, now)).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("bandeja de WhatsApp de la escuela (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("recibe en la bandeja, responde dentro de la ventana y registra estados", async () => {
    const f = await schoolFixture(conn.db);
    await f.athlete("Sofía", { guardianPhone: "3004445566" });
    const numberId = String(Date.now()).slice(-12);
    const verify = async () => ({ ok: true as const, displayPhone: "+57 300 000 0000" });
    expect(
      await connectSchoolNumber(
        conn.db,
        f.ctx,
        { phoneNumberId: numberId, businessAccountId: "123456789", token: "EAAG-token-de-prueba-123" },
        verify,
      ),
    ).toEqual({ ok: true, displayPhone: "+57 300 000 0000" });
    expect(await getSchoolNumber(conn.db, f.ctx.schoolId)).toMatchObject({
      template: "aviso_podium",
      enabled: true,
    });

    const inbound = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: numberId },
                contacts: [{ wa_id: "573004445566", profile: { name: "Laura" } }],
                messages: [
                  {
                    id: `wamid.in.${numberId}`,
                    from: "573004445566",
                    type: "text",
                    text: { body: "¿Hay clase hoy?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const sent: { url: string; body: unknown }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${numberId}` }] }), { status: 200 });
    }) as typeof fetch;
    // Mensaje a un número de escuela: a la bandeja, sin respuesta automática de Podium.
    const podiumSender = {
      sendTemplate: async () => ({ ok: true as const, id: "x" }),
      sendText: async () => {
        throw new Error("no debe responder automáticamente");
      },
    };
    expect(await handleWhatsAppWebhook(conn.db, inbound, podiumSender)).toMatchObject({
      inbox: 1,
      replies: 0,
    });

    const [conversation] = await listConversations(conn.db, f.ctx.schoolId);
    expect(conversation).toMatchObject({
      contactPhone: "+573004445566",
      unread: 1,
      guardianName: "Laura Gómez",
    });
    const opened = await openConversation(conn.db, f.ctx.schoolId, conversation.id);
    expect(opened?.messages.map((m) => [m.direction, m.body])).toEqual([["IN", "¿Hay clase hoy?"]]);
    expect((await listConversations(conn.db, f.ctx.schoolId))[0].unread).toBe(0);

    const now = new Date();
    expect(
      await replyToConversation(conn.db, f.ctx, conversation.id, "Sí, a las 4 p. m.", now, fakeFetch),
    ).toEqual({
      ok: true,
    });
    expect(sent[0].url).toContain(`/${numberId}/messages`);
    expect(sent[0].body).toMatchObject({
      to: "573004445566",
      type: "text",
      text: { body: "Sí, a las 4 p. m." },
    });
    const later = new Date(now.getTime() + 25 * 3_600_000);
    expect(
      await replyToConversation(conn.db, f.ctx, conversation.id, "¿Sigues ahí?", later, fakeFetch),
    ).toEqual({
      ok: false,
      error: "window_closed",
    });

    const status = {
      entry: [{ changes: [{ value: { statuses: [{ id: `wamid.out.${numberId}`, status: "read" }] } }] }],
    };
    expect((await handleWhatsAppWebhook(conn.db, status, null)).statuses).toBe(1);
    const final = await openConversation(conn.db, f.ctx.schoolId, conversation.id);
    expect(final?.messages.map((m) => [m.direction, m.status])).toEqual([
      ["IN", null],
      ["OUT", "read"],
    ]);
  });
});
