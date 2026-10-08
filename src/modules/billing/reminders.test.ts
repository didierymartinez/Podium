import { describe, expect, it } from "vitest";
import { collectionHoursAllowed, reminderStage } from "./reminders";

const at = (iso: string) => new Date(iso);
const TZ = "America/Bogota";

describe("Ley 2300: horario de mensajes de cobro", () => {
  it("permite lunes a viernes de 7 a 19 y sábados de 8 a 15", () => {
    expect(collectionHoursAllowed(at("2026-10-08T14:00:00Z"), TZ)).toBe(true); // jueves 9:00
    expect(collectionHoursAllowed(at("2026-10-08T11:30:00Z"), TZ)).toBe(false); // jueves 6:30
    expect(collectionHoursAllowed(at("2026-10-09T00:30:00Z"), TZ)).toBe(false); // jueves 19:30
    expect(collectionHoursAllowed(at("2026-10-10T14:00:00Z"), TZ)).toBe(true); // sábado 9:00
    expect(collectionHoursAllowed(at("2026-10-10T20:30:00Z"), TZ)).toBe(false); // sábado 15:30
    expect(collectionHoursAllowed(at("2026-10-11T15:00:00Z"), TZ)).toBe(false); // domingo
    expect(collectionHoursAllowed(at("2026-10-12T15:00:00Z"), TZ)).toBe(false); // lunes festivo (Día de la Raza)
  });
});

describe("etapas de recordatorio", () => {
  it("elige la última etapa alcanzada y descarta avisos previos atrasados", () => {
    expect(reminderStage("2026-10-10", "2026-10-07")).toBeNull();
    expect(reminderStage("2026-10-10", "2026-10-08")?.key).toBe("due_soon");
    expect(reminderStage("2026-10-10", "2026-10-10")?.key).toBe("due_today");
    expect(reminderStage("2026-10-10", "2026-10-12")).toBeNull();
    expect(reminderStage("2026-10-10", "2026-10-13")?.key).toBe("overdue_3");
    expect(reminderStage("2026-10-10", "2026-10-25")?.key).toBe("overdue_10");
    expect(reminderStage("2026-10-10", "2026-12-01")?.key).toBe("overdue_30");
  });
});
