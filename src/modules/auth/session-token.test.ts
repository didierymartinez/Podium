import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "./session-token";

const secret = "x".repeat(32);

describe("session token", () => {
  it("firma y verifica el id del usuario", async () => {
    const token = await signSessionToken("user-1", secret);
    expect(await verifySessionToken(token, secret)).toBe("user-1");
  });

  it("rechaza tokens con otro secreto o alterados", async () => {
    const token = await signSessionToken("user-1", secret);
    expect(await verifySessionToken(token, "y".repeat(32))).toBeNull();
    expect(await verifySessionToken(token.slice(0, -2) + "aa", secret)).toBeNull();
    expect(await verifySessionToken("basura", secret)).toBeNull();
  });
});
