import { describe, expect, it } from "vitest";
import { nextGenerationDate } from "./schedule";

describe("nextGenerationDate", () => {
  it("usa el mes actual si el día no ha pasado", () => {
    expect(nextGenerationDate("2026-10-01", 1)).toBe("2026-10-01");
    expect(nextGenerationDate("2026-10-03", 5)).toBe("2026-10-05");
  });

  it("pasa al mes siguiente, incluido el cambio de año", () => {
    expect(nextGenerationDate("2026-10-08", 1)).toBe("2026-11-01");
    expect(nextGenerationDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(nextGenerationDate("2026-01-30", 28)).toBe("2026-02-28");
  });
});
