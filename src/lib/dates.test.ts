import { describe, expect, it } from "vitest";
import {
  addDays,
  dateRange,
  formatLongDate,
  formatWeekdayShort,
  startOfWeek,
  todayIn,
  weekdayIndex,
} from "./dates";

describe("dates", () => {
  it("usa la fecha de Bogotá aunque en UTC ya sea el día siguiente", () => {
    expect(todayIn("America/Bogota", new Date("2026-10-09T03:00:00Z"))).toBe("2026-10-08");
  });

  it("calcula la semana desde el lunes", () => {
    expect(weekdayIndex("2026-10-08")).toBe(3); // jueves
    expect(startOfWeek("2026-10-08")).toBe("2026-10-05");
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05"); // domingo
    expect(dateRange("2026-10-05", 3)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("formatea en español", () => {
    expect(formatWeekdayShort("2026-10-05")).toBe("lun");
    expect(formatLongDate("2026-10-08")).toBe("8 de octubre de 2026");
  });
});

describe("instantOf", () => {
  it("convierte hora local de Bogotá a instante UTC", async () => {
    const { instantOf } = await import("./dates");
    expect(instantOf("2026-10-08", "18:00", "America/Bogota").toISOString()).toBe("2026-10-08T23:00:00.000Z");
    expect(instantOf("2026-10-08", "18:00:00", "UTC").toISOString()).toBe("2026-10-08T18:00:00.000Z");
  });
});
