import { describe, expect, it } from "vitest";
import { ageOn, canTransition } from "./enrollment-status";

describe("matrículas", () => {
  it("solo permite transiciones válidas", () => {
    expect(canTransition("ACTIVE", "FROZEN")).toBe(true);
    expect(canTransition("FROZEN", "ACTIVE")).toBe(true);
    expect(canTransition("WITHDRAWN", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "PRE_ENROLLED")).toBe(false);
    expect(canTransition("DISCARDED", "ACTIVE")).toBe(false);
  });

  it("calcula la edad cumplida", () => {
    expect(ageOn("2008-10-09", "2026-10-08")).toBe(17);
    expect(ageOn("2008-10-08", "2026-10-08")).toBe(18);
    expect(ageOn("2016-02-29", "2026-03-01")).toBe(10);
  });
});
