import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fcmNotifier } from "@/lib/notifier/fcm";
import { resendMailer } from "./resend";
import { emailLayout, PODIUM_BRAND } from "./templates";

describe("correo y push", () => {
  it("Resend recibe el correo con remitente y asunto", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const { html, text } = emailLayout({ brand: PODIUM_BRAND, title: "Hola <b>", paragraphs: ["Línea"] });
    expect(html).toContain("Hola &lt;b&gt;");
    expect(
      await resendMailer({ apiKey: "re_x", from: "Podium <hola@x.co>" }, fake).send({
        to: "a@b.co",
        subject: "Asunto",
        html,
        text,
      }),
    ).toEqual({
      ok: true,
      id: "em_1",
    });
    expect(calls[0]).toMatchObject({
      url: "https://api.resend.com/emails",
      body: { from: "Podium <hola@x.co>", to: ["a@b.co"], subject: "Asunto" },
    });
  });

  it("FCM firma el token OAuth con la cuenta de servicio y reporta tokens inválidos", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const seen: string[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push(String(url));
      if (String(url).includes("oauth2")) {
        expect(String(init.body)).toContain(
          "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer",
        );
        return new Response(JSON.stringify({ access_token: "ya29", expires_in: 3600 }), { status: 200 });
      }
      const body = JSON.parse(String(init.body));
      return body.message.token === "bad"
        ? new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', {
            status: 404,
          })
        : new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const notifier = fcmNotifier(
      { project_id: "podium", client_email: "x@podium.iam.gserviceaccount.com", private_key: pem },
      "https://app.test",
      fake,
    );
    expect(await notifier.send("good", { title: "T", body: "B", href: "/x" })).toBe("sent");
    expect(await notifier.send("bad", { title: "T", body: "B", href: "/x" })).toBe("invalid_token");
    // El token OAuth se reutiliza.
    expect(seen.filter((u) => u.includes("oauth2"))).toHaveLength(1);
  });
});
