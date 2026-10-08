import type { schoolRoleEnum, schoolStatusEnum } from "@/db/schema";

type Role = (typeof schoolRoleEnum.enumValues)[number];
type Status = (typeof schoolStatusEnum.enumValues)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  COORDINATOR: "Coordinador",
  COACH: "Profesor",
  GUARDIAN: "Acudiente",
  ATHLETE: "Alumno",
};

export const STATUS_LABELS: Record<Status, string> = {
  TRIAL: "Prueba",
  ACTIVE: "Activa",
  PAST_DUE: "En mora",
  READ_ONLY: "Solo lectura",
  CANCELED: "Cancelada",
};
