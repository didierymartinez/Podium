import { describe, expect, it } from "vitest";
import { integritySignature, keysLookValid, signedTestEvent, wompiProvider } from "./wompi";

const keys = {
  environment: "sandbox" as const,
  publicKey: "pub_test_abc",
  privateKey: "prv_test_abc",
  eventsSecret: "test_events_secret",
  integritySecret: "test_integrity_secret",
};

describe("Wompi", () => {
  it("valida los prefijos de las llaves según el ambiente", () => {
    expect(keysLookValid(keys)).toBe(true);
    expect(keysLookValid({ ...keys, environment: "production" })).toBe(false);
  });

  it("firma el checkout con el secreto de integridad", () => {
    const url = new URL(
      wompiProvider().checkoutUrl(keys, {
        reference: "REF1",
        amountInCents: 2_880_000_00,
        redirectUrl: "https://app/x",
      }),
    );
    expect(url.searchParams.get("signature:integrity")).toBe(
      integritySignature("REF1", 2_880_000_00, "COP", keys.integritySecret),
    );
    expect(url.searchParams.get("public-key")).toBe("pub_test_abc");
  });

  it("acepta solo eventos con la firma correcta", () => {
    const tx = {
      id: "123-1",
      status: "APPROVED",
      amount_in_cents: 1000000,
      reference: "REF1",
      created_at: "2026-10-04T15:00:00Z",
    };
    const event = signedTestEvent(tx, keys.eventsSecret);
    expect(wompiProvider().parseEvent(keys, event)).toMatchObject({
      id: "123-1",
      status: "APPROVED",
      amountInCents: 1000000,
    });
    expect(wompiProvider().parseEvent({ eventsSecret: "otro" }, event)).toBeNull();
    const tampered = { ...event, data: { transaction: { ...tx, amount_in_cents: 1 } } };
    expect(wompiProvider().parseEvent(keys, tampered)).toBeNull();
  });

  it("prueba la conexión consultando el comercio", async () => {
    const fake = (async (url: string) =>
      new Response(JSON.stringify({ data: { name: "Club X", legal_name: "Club X SAS" } }), {
        status: String(url).includes("pub_test_abc") ? 200 : 404,
      })) as unknown as typeof fetch;
    expect(await wompiProvider(fake).verifyAccount(keys)).toEqual({ ok: true, merchantName: "Club X SAS" });
    expect((await wompiProvider(fake).verifyAccount({ ...keys, publicKey: "pub_test_zzz" })).ok).toBe(false);
  });
});
