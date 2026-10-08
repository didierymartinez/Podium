import { describe, expect, it } from "vitest";
import { formatPerformance, isBetter, parsePerformance, targetProgress } from "./format";

describe("marcas", () => {
  it("lee tiempos y números como los escribe el profesor", () => {
    expect(parsePerformance("TIME", "45,32")).toBe(45.32);
    expect(parsePerformance("TIME", "1:02.35")).toBe(62.35);
    expect(parsePerformance("TIME", "1:05:30")).toBe(3930);
    expect(parsePerformance("TIME", "abc")).toBeNull();
    expect(parsePerformance("DISTANCE", "245")).toBe(245);
    expect(parsePerformance("REPS", "0")).toBeNull();
  });

  it("formatea según el tipo", () => {
    expect(formatPerformance("TIME", "s", 45.32)).toBe("45,32 s");
    expect(formatPerformance("TIME", "s", 45.321)).toBe("45,321 s");
    expect(formatPerformance("TIME", "s", 62.35)).toBe("1:02,35");
    expect(formatPerformance("TIME", "s", 3930)).toBe("1:05:30");
    expect(formatPerformance("DISTANCE", "cm", 245)).toBe("245 cm");
  });

  it("compara y calcula el avance al objetivo", () => {
    expect(isBetter(44, 45, true)).toBe(true);
    expect(isBetter(250, 245, false)).toBe(true);
    expect(targetProgress(50, 45, true)).toBe(90);
    expect(targetProgress(200, 250, false)).toBe(80);
    expect(targetProgress(40, 45, true)).toBe(100);
  });
});
