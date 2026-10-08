import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { isDisposableEmail } from "./disposable-email";
import { hitRateLimit, parseLimit } from "./rate-limit";
import { verifyTurnstile } from "./turnstile";

describe("emails desechables", () => {
  it("bloquea dominios y subdominios conocidos", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@foo.yopmail.com")).toBe(true);
    expect(isDisposableEmail("ana@gmail.com")).toBe(false);
    expect(isDisposableEmail("ana@escuela.edu.co")).toBe(false);
    expect(isDisposableEmail("sin-arroba")).toBe(false);
  });
});

describe("turnstile", () => {
  const fake = (body: object, ok = true) =>
    (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch;

  it("acepta solo respuestas exitosas de Cloudflare", async () => {
    expect(await verifyTurnstile("tok", { secret: "s", ip: "1.2.3.4", fetch: fake({ success: true }) })).toBe(
      true,
    );
    expect(await verifyTurnstile("tok", { secret: "s", ip: null, fetch: fake({ success: false }) })).toBe(
      false,
    );
    expect(await verifyTurnstile("tok", { secret: "s", ip: null, fetch: fake({}, false) })).toBe(false);
    expect(await verifyTurnstile(undefined, { secret: "s", ip: null, fetch: fake({ success: true }) })).toBe(
      false,
    );
  });

  it("envía el secreto, el token y la IP", async () => {
    let sent: URLSearchParams | null = null;
    const spy = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ success: true }));
    }) as unknown as typeof fetch;
    await verifyTurnstile("tok", { secret: "sec", ip: "9.9.9.9", fetch: spy });
    expect(Object.fromEntries(sent!)).toEqual({ secret: "sec", response: "tok", remoteip: "9.9.9.9" });
  });
});

describe("límite de intentos", () => {
  it("lee la configuración", () => {
    expect(parseLimit("5/60", { max: 1, windowSeconds: 1 })).toEqual({ max: 5, windowSeconds: 60 });
    expect(parseLimit("x", { max: 1, windowSeconds: 1 })).toEqual({ max: 1, windowSeconds: 1 });
  });
});

describe.skipIf(!testDatabaseUrl)("límite de intentos (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("permite hasta el máximo por ventana y luego bloquea", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const limit = { max: 3, windowSeconds: 60 };
    const now = new Date("2026-10-08T12:00:30Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hitRateLimit(conn.db, key, limit, now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfter).toBe(30);
    // La siguiente ventana empieza de cero.
    expect((await hitRateLimit(conn.db, key, limit, new Date("2026-10-08T12:01:01Z"))).allowed).toBe(true);
  });
});
