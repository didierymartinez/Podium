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

describe("canManagePeople", () => {
  it("incluye coordinador, no profesor ni acudiente", async () => {
    const { canManagePeople } = await import("./permissions");
    expect(canManagePeople(["COORDINATOR"])).toBe(true);
    expect(canManagePeople(["COACH"])).toBe(false);
    expect(canManagePeople(["GUARDIAN"])).toBe(false);
  });
});
