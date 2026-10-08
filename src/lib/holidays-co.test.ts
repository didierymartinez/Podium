import { describe, expect, it } from "vitest";
import { colombianHolidays, easterSunday, holidaysBetween } from "./holidays-co";

describe("festivos de Colombia", () => {
  it("calcula el domingo de Pascua", () => {
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  it("coincide con el calendario oficial 2026", () => {
    expect(colombianHolidays(2026).map((h) => h.date)).toEqual([
      "2026-01-01",
      "2026-01-12",
      "2026-03-23",
      "2026-04-02",
      "2026-04-03",
      "2026-05-01",
      "2026-05-18",
      "2026-06-08",
      "2026-06-15",
      "2026-06-29",
      "2026-07-20",
      "2026-08-07",
      "2026-08-17",
      "2026-10-12",
      "2026-11-02",
      "2026-11-16",
      "2026-12-08",
      "2026-12-25",
    ]);
  });

  it("coincide con el calendario oficial 2025 y une festivos del mismo día", () => {
    const h2025 = colombianHolidays(2025);
    expect(h2025.map((h) => h.date)).toEqual([
      "2025-01-01",
      "2025-01-06",
      "2025-03-24",
      "2025-04-17",
      "2025-04-18",
      "2025-05-01",
      "2025-06-02",
      "2025-06-23",
      "2025-06-30",
      "2025-07-20",
      "2025-08-07",
      "2025-08-18",
      "2025-10-13",
      "2025-11-03",
      "2025-11-17",
      "2025-12-08",
      "2025-12-25",
    ]);
    expect(h2025.find((h) => h.date === "2025-06-30")?.name).toBe("Sagrado Corazón y San Pedro y San Pablo");
  });

  it("filtra por rango, incluso entre años", () => {
    const range = holidaysBetween("2026-12-20", "2027-01-15");
    expect([...range.keys()]).toEqual(["2026-12-25", "2027-01-01", "2027-01-11"]);
    expect(range.get("2026-12-25")).toBe("Navidad");
  });
});
