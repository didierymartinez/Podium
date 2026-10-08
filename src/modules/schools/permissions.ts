import type { schoolRoleEnum } from "@/db/schema";

export type SchoolRole = (typeof schoolRoleEnum.enumValues)[number];

/** Configurar escuela, tarifas y políticas (docs/GESTION_ADMINISTRATIVA.md §1). */
export function canManageSettings(roles: readonly SchoolRole[]): boolean {
  return roles.includes("OWNER") || roles.includes("ADMIN");
}

/** Suscripción a Podium, cancelación y eliminación: solo el propietario (ONBOARDING §4). */
export function canManageSubscription(roles: readonly SchoolRole[]): boolean {
  return roles.includes("OWNER");
}

export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para esta acción") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Crear y editar alumnos, acudientes, grupos y matrículas. */
export function canManagePeople(roles: readonly SchoolRole[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "ADMIN" || r === "COORDINATOR");
}

/** Ver datos de salud (cifrados en la base de datos). */
export function canViewHealthData(roles: readonly SchoolRole[]): boolean {
  return canManagePeople(roles);
}
