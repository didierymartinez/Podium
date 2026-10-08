import { describe, expect, it } from "vitest";
import { nitCheckDigit, normalizeNit } from "./nit";

describe("NIT", () => {
  it("calcula el dígito de verificación (casos conocidos de la DIAN)", () => {
    expect(nitCheckDigit("800197268")).toBe(4); // DIAN
    expect(nitCheckDigit("899999034")).toBe(1); // SENA
  });

  it("normaliza y valida", () => {
    expect(normalizeNit("800.197.268-4")).toBe("800197268-4");
    expect(normalizeNit("800197268")).toBe("800197268-4");
    expect(normalizeNit("800197268-5")).toBeNull();
    expect(normalizeNit("abc")).toBeNull();
  });
});
