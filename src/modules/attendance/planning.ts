import { addDays, dateRange, weekdayIndex, type IsoDate } from "@/lib/dates";
import { closureOn, type Closure } from "@/modules/calendar/closures";
import { hhmm, type ScheduleSlot } from "@/modules/groups/schedule";

export const HORIZON_WEEKS = 8;
/** Días hacia atrás en los que todavía se generan clases (para registrar asistencia reciente). */
export const LOOKBACK_DAYS = 14;
export { COACH_EDIT_WINDOW_HOURS } from "./window";

export type PlannedSession = { groupId: string; date: IsoDate; startTime: string; endTime: string };

export type PlanGroup = { id: string; active: boolean; createdOn: IsoDate; schedule: ScheduleSlot[] };

/**
 * Clases que deberían existir entre `from` y `to` según los horarios.
 * Incluye fines de semana y festivos (decisión de producto: son solo referencia);
 * omite únicamente los días sin clase que configuró la escuela y fechas antes de crear el grupo.
 */
export function planSessions(
  groups: PlanGroup[],
  closures: Pick<Closure, "startDate" | "endDate" | "reason">[],
  from: IsoDate,
  to: IsoDate,
): PlannedSession[] {
  const days = dateRange(from, Math.max(0, daysBetween(from, to) + 1));
  const planned: PlannedSession[] = [];
  for (const group of groups) {
    if (!group.active) continue;
    for (const date of days) {
      if (date < group.createdOn || closureOn(date, closures)) continue;
      for (const slot of group.schedule) {
        if (slot.weekday !== weekdayIndex(date)) continue;
        planned.push({
          groupId: group.id,
          date,
          startTime: hhmm(slot.startTime),
          endTime: hhmm(slot.endTime),
        });
      }
    }
  }
  return planned;
}

export function planningWindow(today: IsoDate) {
  return { from: addDays(today, -LOOKBACK_DAYS), to: addDays(today, HORIZON_WEEKS * 7 - 1) };
}

export const sessionKey = (s: { groupId: string; date: string; startTime: string }) =>
  `${s.groupId}|${s.date}|${hhmm(s.startTime)}`;

function daysBetween(from: IsoDate, to: IsoDate) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type AttendanceCounts = { present: number; late: number; absent: number; excused: number };

/** % de asistencia = (presente + tarde) ÷ (registros − excusas). Null si no hay base. */
export function attendanceRate(c: AttendanceCounts): number | null {
  const base = c.present + c.late + c.absent;
  return base === 0 ? null : Math.round(((c.present + c.late) / base) * 100);
}

export { canRecordAttendance } from "./window";
