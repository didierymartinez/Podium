export const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function trialEndsAt(from: Date): Date {
  return new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
}

/** Días completos o parciales que quedan de prueba (0 si ya venció). */
export function trialDaysLeft(endsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}
