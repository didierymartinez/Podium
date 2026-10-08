import { WEEKDAYS, hhmm, type ScheduleSlot } from "@/modules/groups/schedule";

export type GroupWithCoaches = {
  id: string;
  name: string;
  active: boolean;
  schedule: ScheduleSlot[];
  coaches: { id: string; name: string }[];
};

export type CoachConflict = {
  coachId: string;
  coachName: string;
  groupIds: [string, string];
  description: string;
};

const overlaps = (a: ScheduleSlot, b: ScheduleSlot) =>
  a.weekday === b.weekday && hhmm(a.startTime) < hhmm(b.endTime) && hhmm(b.startTime) < hhmm(a.endTime);

/** DEP-17: un profesor asignado a dos grupos activos cuyas clases se cruzan. */
export function coachScheduleConflicts(groups: GroupWithCoaches[]): CoachConflict[] {
  const active = groups.filter((g) => g.active);
  const conflicts: CoachConflict[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      for (const coach of a.coaches) {
        if (!b.coaches.some((c) => c.id === coach.id)) continue;
        const clash = a.schedule.flatMap((sa) =>
          b.schedule.filter((sb) => overlaps(sa, sb)).map(() => sa),
        )[0];
        if (clash) {
          conflicts.push({
            coachId: coach.id,
            coachName: coach.name,
            groupIds: [a.id, b.id],
            description: `${coach.name} tiene ${a.name} y ${b.name} al mismo tiempo el ${WEEKDAYS[clash.weekday].toLowerCase()}`,
          });
        }
      }
    }
  }
  return conflicts;
}
