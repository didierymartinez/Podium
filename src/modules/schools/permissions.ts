import type { schoolRoleEnum } from "@/db/schema";

export type SchoolRole = (typeof schoolRoleEnum.enumValues)[number];

/** Configurar escuela, tarifas y políticas (docs/GESTION_ADMINISTRATIVA.md §1). */
export function canManageSettings(roles: readonly SchoolRole[]): boolean {
  return roles.includes("OWNER") || roles.includes("ADMIN");
}

export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para esta acción") {
    super(message);
    this.name = "ForbiddenError";
  }
}
