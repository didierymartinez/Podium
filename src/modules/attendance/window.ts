/** Reglas de la ventana de registro; sin dependencias para usarlas también en el navegador (sin conexión). */

/** El profesor puede registrar o corregir asistencia hasta 48 h después de la clase (DEP-22). */
export const COACH_EDIT_WINDOW_HOURS = 48;

/** Quién puede registrar asistencia: administración siempre; profesor del grupo hasta 48 h después. */
export function canRecordAttendance(input: {
  isManager: boolean;
  isGroupCoach: boolean;
  sessionEnd: Date;
  sessionStart: Date;
  now: Date;
}): { allowed: boolean; reason?: "not_coach" | "too_early" | "window_closed" } {
  if (input.isManager) return { allowed: true };
  if (!input.isGroupCoach) return { allowed: false, reason: "not_coach" };
  // Se puede abrir la lista desde 1 h antes de la clase (llegada a la pista).
  if (input.now.getTime() < input.sessionStart.getTime() - 3_600_000)
    return { allowed: false, reason: "too_early" };
  if (input.now.getTime() > input.sessionEnd.getTime() + COACH_EDIT_WINDOW_HOURS * 3_600_000) {
    return { allowed: false, reason: "window_closed" };
  }
  return { allowed: true };
}
