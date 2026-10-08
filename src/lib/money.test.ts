import { describe, expect, it } from "vitest";
import { formatCOP, parseCOP } from "./money";

describe("money", () => {
  it("formatea pesos colombianos sin decimales", () => {
    expect(formatCOP(180000)).toBe("$ 180.000");
    expect(formatCOP(0)).toBe("$ 0");
  });

  it("interpreta lo que escribe la gente", () => {
    expect(parseCOP("$ 180.000")).toBe(180000);
    expect(parseCOP("180000")).toBe(180000);
    expect(parseCOP("180.000,00")).toBe(180000);
    expect(parseCOP("abc")).toBeNull();
    expect(parseCOP("")).toBeNull();
  });
});
