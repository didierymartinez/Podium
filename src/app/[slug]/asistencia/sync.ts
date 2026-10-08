import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { syncSessions } from "@/modules/attendance/sessions";

/**
 * Asegura que existan las clases de la ventana (idempotente y barato cuando ya están).
 * Se llama al abrir el tablero o la asistencia y después de cambiar horarios o días sin clase.
 */
export const ensureSessions = cache(async (schoolId: string, timezone: string) =>
  syncSessions(db, { id: schoolId, timezone }, todayIn(timezone)),
);

export const resyncSessions = (school: { id: string; timezone: string }) =>
  syncSessions(db, school, todayIn(school.timezone));
