import { describe, expect, it } from "vitest";
import { coachScheduleConflicts, type GroupWithCoaches } from "./conflicts";

const juan = { id: "c1", name: "Juan Pérez" };
const group = (
  id: string,
  slots: [number, string, string][],
  coaches = [juan],
  active = true,
): GroupWithCoaches => ({
  id,
  name: `Grupo ${id}`,
  active,
  coaches,
  schedule: slots.map(([weekday, startTime, endTime]) => ({ weekday, startTime, endTime })),
});

describe("coachScheduleConflicts", () => {
  it("detecta clases que se cruzan para el mismo profesor", () => {
    const conflicts = coachScheduleConflicts([
      group("A", [[1, "16:00", "18:00"]]),
      group("B", [[1, "17:00", "19:00"]]),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].description).toBe("Juan Pérez tiene Grupo A y Grupo B al mismo tiempo el martes");
  });

  it("no hay cruce si las clases son seguidas, en otro día, de otro profesor o el grupo está archivado", () => {
    expect(
      coachScheduleConflicts([group("A", [[1, "16:00", "18:00"]]), group("B", [[1, "18:00", "19:00"]])]),
    ).toEqual([]);
    expect(
      coachScheduleConflicts([group("A", [[1, "16:00", "18:00"]]), group("B", [[2, "16:00", "18:00"]])]),
    ).toEqual([]);
    expect(
      coachScheduleConflicts([
        group("A", [[1, "16:00", "18:00"]]),
        group("B", [[1, "16:00", "18:00"]], [{ id: "c2", name: "Otra" }]),
      ]),
    ).toEqual([]);
    expect(
      coachScheduleConflicts([
        group("A", [[1, "16:00", "18:00"]]),
        group("B", [[1, "16:00", "18:00"]], [juan], false),
      ]),
    ).toEqual([]);
  });
});
