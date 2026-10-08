import { describe, expect, it } from "vitest";
import { describeSchedule, formatTime, scheduleSchema, weeklyMinutes } from "./schedule";

const slot = (weekday: number, startTime: string, endTime: string) => ({ weekday, startTime, endTime });

describe("horario de grupos", () => {
  it("resume días con el mismo horario", () => {
    expect(
      describeSchedule([
        slot(4, "16:00", "18:00"),
        slot(0, "16:00", "18:00"),
        slot(2, "16:00:00", "18:00:00"),
      ]),
    ).toBe("Lun, Mié y Vie · 4:00 p. m. – 6:00 p. m.");
    expect(describeSchedule([slot(5, "08:00", "10:00")])).toBe("Sáb · 8:00 a. m. – 10:00 a. m.");
  });

  it("formatea horas y suma minutos", () => {
    expect(formatTime("00:30")).toBe("12:30 a. m.");
    expect(formatTime("12:00")).toBe("12:00 p. m.");
    expect(weeklyMinutes([slot(0, "16:00", "18:00"), slot(2, "16:00", "17:30")])).toBe(210);
  });

  it("valida horarios", () => {
    expect(scheduleSchema.safeParse([]).success).toBe(false);
    expect(scheduleSchema.safeParse([slot(0, "18:00", "16:00")]).success).toBe(false);
    expect(scheduleSchema.safeParse([slot(0, "16:00", "18:00"), slot(0, "17:00", "19:00")]).success).toBe(
      false,
    );
    expect(scheduleSchema.safeParse([slot(0, "16:00", "18:00"), slot(0, "18:00", "19:00")]).success).toBe(
      true,
    );
  });
});

describe("shortTimeRange", () => {
  it("compacta rangos para el tablero", async () => {
    const { shortTimeRange } = await import("./schedule");
    expect(shortTimeRange("16:00", "18:00")).toBe("4–6pm");
    expect(shortTimeRange("08:00:00", "11:00:00")).toBe("8–11am");
    expect(shortTimeRange("11:00", "13:00")).toBe("11am–1pm");
    expect(shortTimeRange("16:30", "18:00")).toBe("4:30–6pm");
  });
});
