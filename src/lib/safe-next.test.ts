import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("solo acepta links de invitación internos", () => {
    const token = "a".repeat(43);
    expect(safeNext(`/i/${token}`)).toBe(`/i/${token}`);
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/escuelas")).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });
});
