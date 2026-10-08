import { describe, expect, it } from "vitest";
import { signSessionToken, signSupportToken, verifySessionToken, verifySupportToken } from "./session-token";

const secret = "x".repeat(32);

describe("token de sesión", () => {
  it("firma y verifica el usuario y el segundo factor", async () => {
    const token = await signSessionToken("user-1", secret);
    expect(await verifySessionToken(token, secret)).toEqual({ userId: "user-1", mfa: false });
    const strong = await signSessionToken("user-1", secret, { mfa: true });
    expect(await verifySessionToken(strong, secret)).toEqual({ userId: "user-1", mfa: true });
  });

  it("rechaza tokens alterados o con otro secreto", async () => {
    const token = await signSessionToken("user-1", secret);
    expect(await verifySessionToken(token, "y".repeat(32))).toBeNull();
    expect(await verifySessionToken(token.slice(0, -2) + "aa", secret)).toBeNull();
    expect(await verifySessionToken("basura", secret)).toBeNull();
  });

  it("el token de soporte no sirve como sesión ni al revés", async () => {
    const support = await signSupportToken({ adminUserId: "a", schoolId: "s", reason: "Ticket 12" }, secret);
    expect(await verifySupportToken(support, secret)).toMatchObject({
      adminUserId: "a",
      schoolId: "s",
      reason: "Ticket 12",
    });
    const session = await signSessionToken("a", secret);
    expect(await verifySupportToken(session, secret)).toBeNull();
    expect(await verifySessionToken(support, secret)).toBeNull();
  });
});
