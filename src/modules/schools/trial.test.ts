import { describe, expect, it } from "vitest";
import { trialDaysLeft, trialEndsAt } from "./trial";

describe("trial", () => {
  it("dura 30 días", () => {
    const start = new Date("2026-10-08T12:00:00Z");
    expect(trialEndsAt(start).toISOString()).toBe("2026-11-07T12:00:00.000Z");
  });

  it("cuenta días restantes y nunca es negativo", () => {
    const end = new Date("2026-11-07T12:00:00Z");
    expect(trialDaysLeft(end, new Date("2026-11-06T13:00:00Z"))).toBe(1);
    expect(trialDaysLeft(end, new Date("2026-10-08T12:00:00Z"))).toBe(30);
    expect(trialDaysLeft(end, new Date("2026-12-01T00:00:00Z"))).toBe(0);
  });
});
