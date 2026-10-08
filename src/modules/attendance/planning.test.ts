import { describe, expect, it } from "vitest";
import { attendanceRate, canRecordAttendance, planSessions, type PlanGroup } from "./planning";

const group: PlanGroup = {
  id: "g1",
  active: true,
  createdOn: "2026-10-01",
  schedule: [
    { weekday: 0, startTime: "16:00:00", endTime: "18:00:00" }, // lunes
    { weekday: 5, startTime: "08:00", endTime: "10:00" }, // sábado
  ],
};

describe("planSessions", () => {
  it("incluye festivos y fines de semana (solo referencia)", () => {
    // 2026-10-12 es festivo (Día de la Raza) y lunes; 2026-10-17 es sábado.
    const plan = planSessions([group], [], "2026-10-12", "2026-10-18");
    expect(plan).toEqual([
      { groupId: "g1", date: "2026-10-12", startTime: "16:00", endTime: "18:00" },
      { groupId: "g1", date: "2026-10-17", startTime: "08:00", endTime: "10:00" },
    ]);
  });

  it("omite los días sin clase de la escuela y fechas antes de crear el grupo", () => {
    const plan = planSessions(
      [group],
      [{ startDate: "2026-10-17", endDate: "2026-10-31", reason: "Vacaciones" }],
      "2026-09-26",
      "2026-11-02",
    );
    expect(plan.map((p) => p.date)).toEqual([
      "2026-10-03",
      "2026-10-05",
      "2026-10-10",
      "2026-10-12",
      "2026-11-02",
    ]);
  });

  it("ignora grupos archivados", () => {
    expect(planSessions([{ ...group, active: false }], [], "2026-10-12", "2026-10-18")).toEqual([]);
  });
});

describe("attendanceRate", () => {
  it("las excusas no cuentan en contra", () => {
    expect(attendanceRate({ present: 8, late: 1, absent: 1, excused: 2 })).toBe(90);
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 3 })).toBeNull();
  });
});

describe("canRecordAttendance", () => {
  const start = new Date("2026-10-08T21:00:00Z");
  const end = new Date("2026-10-08T23:00:00Z");
  const at = (iso: string) => new Date(iso);

  it("profesor del grupo: desde 1 h antes hasta 48 h después", () => {
    const base = { isManager: false, isGroupCoach: true, sessionStart: start, sessionEnd: end };
    expect(canRecordAttendance({ ...base, now: at("2026-10-08T19:59:00Z") }).reason).toBe("too_early");
    expect(canRecordAttendance({ ...base, now: at("2026-10-08T20:30:00Z") }).allowed).toBe(true);
    expect(canRecordAttendance({ ...base, now: at("2026-10-10T22:59:00Z") }).allowed).toBe(true);
    expect(canRecordAttendance({ ...base, now: at("2026-10-10T23:01:00Z") }).reason).toBe("window_closed");
  });

  it("otro profesor no; la administración siempre", () => {
    const now = at("2026-10-20T00:00:00Z");
    expect(
      canRecordAttendance({
        isManager: false,
        isGroupCoach: false,
        sessionStart: start,
        sessionEnd: end,
        now,
      }).reason,
    ).toBe("not_coach");
    expect(
      canRecordAttendance({ isManager: true, isGroupCoach: false, sessionStart: start, sessionEnd: end, now })
        .allowed,
    ).toBe(true);
  });
});
