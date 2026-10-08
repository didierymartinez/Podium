import { describe, expect, it } from "vitest";
import { canManageSettings } from "./permissions";

describe("canManageSettings", () => {
  it("solo propietario y administrador", () => {
    expect(canManageSettings(["OWNER"])).toBe(true);
    expect(canManageSettings(["ADMIN"])).toBe(true);
    expect(canManageSettings(["COORDINATOR"])).toBe(false);
    expect(canManageSettings(["COACH", "GUARDIAN"])).toBe(false);
  });
});
