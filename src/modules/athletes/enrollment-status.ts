import type { enrollmentStatusEnum, withdrawalReasonEnum } from "@/db/schema";

export type EnrollmentStatus = (typeof enrollmentStatusEnum.enumValues)[number];
export type WithdrawalReason = (typeof withdrawalReasonEnum.enumValues)[number];

/** Estados vigentes: ocupan cupo en el grupo y aparecen en la ficha como matrícula actual. */
export const CURRENT_STATUSES: EnrollmentStatus[] = ["PRE_ENROLLED", "ACTIVE", "FROZEN"];

/** Transiciones permitidas (docs/GESTION_ADMINISTRATIVA.md §4.1). */
const TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  PRE_ENROLLED: ["ACTIVE", "DISCARDED"],
  ACTIVE: ["FROZEN", "WITHDRAWN"],
  FROZEN: ["ACTIVE", "WITHDRAWN"],
  WITHDRAWN: ["ACTIVE"],
  DISCARDED: ["PRE_ENROLLED"],
};

export function canTransition(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  PRE_ENROLLED: "Preinscrito",
  ACTIVE: "Activo",
  FROZEN: "Congelado",
  WITHDRAWN: "Retirado",
  DISCARDED: "Descartado",
};

export const WITHDRAWAL_REASON_LABELS: Record<WithdrawalReason, string> = {
  ECONOMIC: "Económico",
  SCHEDULE: "Horario",
  OTHER_SPORT: "Cambio de deporte",
  INJURY: "Lesión",
  DISSATISFACTION: "Insatisfacción",
  MOVED: "Mudanza",
  OTHER: "Otro",
};

/** Edad cumplida en una fecha (para saber si es mayor de edad). */
export function ageOn(birthDate: string, on: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export const ADULT_AGE = 18;
