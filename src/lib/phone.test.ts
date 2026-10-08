import { describe, expect, it } from "vitest";
import { normalizeColombianMobile } from "./phone";

describe("normalizeColombianMobile", () => {
  it("normaliza formatos comunes", () => {
    expect(normalizeColombianMobile("300 123 4567")).toBe("+573001234567");
    expect(normalizeColombianMobile("+57 300-123-4567")).toBe("+573001234567");
    expect(normalizeColombianMobile("573001234567")).toBe("+573001234567");
  });

  it("rechaza números que no son celulares colombianos", () => {
    expect(normalizeColombianMobile("6041234567")).toBeNull();
    expect(normalizeColombianMobile("30012345")).toBeNull();
    expect(normalizeColombianMobile("")).toBeNull();
  });
});

describe("displayPhone", () => {
  it("muestra el celular legible", async () => {
    const { displayPhone } = await import("./phone");
    expect(displayPhone("+573001234567")).toBe("300 123 4567");
    expect(displayPhone(null)).toBe("");
  });
});
