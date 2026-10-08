import { idbAll, idbDelete, idbGet, idbSet } from "./idb";

/** Asistencia marcada sin conexión, pendiente de enviar (una por clase: la última gana). */
export type PendingAttendance = {
  sessionId: string;
  slug: string;
  entries: { athleteId: string; status: string; excuseReason: string | null }[];
  recordedAt: string;
  lastError?: string;
};

export const OUTBOX_EVENT = "podium:outbox";
const notify = () => window.dispatchEvent(new Event(OUTBOX_EVENT));

export async function queueAttendance(item: PendingAttendance) {
  await idbSet("outbox", item.sessionId, item);
  notify();
}

export const pendingFor = (sessionId: string) => idbGet<PendingAttendance>("outbox", sessionId);
export const allPending = () => idbAll<PendingAttendance>("outbox");

export async function removePending(sessionId: string) {
  await idbDelete("outbox", sessionId);
  notify();
}

export async function markFailed(item: PendingAttendance, error: string) {
  await idbSet("outbox", item.sessionId, { ...item, lastError: error });
  notify();
}

/** ¿El error es de red (reintentar) o una respuesta del servidor (no reintentar)? */
export function isNetworkError(err: unknown) {
  return (
    err instanceof TypeError ||
    (err instanceof Error && /fetch|network|Failed to fetch|Load failed/i.test(err.message))
  );
}
