/** Textos de invitación (sin dependencias de servidor: se usan también en el cliente). */

export type InvitationRole = "GUARDIAN" | "ATHLETE" | "COACH";

export function invitationMessage(input: {
  role: InvitationRole;
  schoolName: string;
  inviteeFirstName: string;
  athleteNames: string[];
  link: string;
}): string {
  const { role, schoolName, inviteeFirstName, athleteNames, link } = input;
  const greeting = `Hola ${inviteeFirstName} 👋`;
  if (role === "GUARDIAN") {
    const kids = listNames(athleteNames);
    return `${greeting} ${schoolName} te invita a Podium para ver las clases y pagos de ${kids}. Activa tu cuenta aquí: ${link} (vence en 7 días)`;
  }
  if (role === "COACH") {
    return `${greeting} ${schoolName} te agregó como profesor en Podium. Activa tu cuenta aquí: ${link} (vence en 7 días)`;
  }
  return `${greeting} ${schoolName} te invita a Podium para ver tus clases y tu progreso. Activa tu cuenta aquí: ${link} (vence en 7 días)`;
}

/** ["Sofía", "Tomás", "Ana"] → "Sofía, Tomás y Ana" */
export function listNames(names: string[]): string {
  if (names.length === 0) return "tu familia";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

export const INVITATION_ROLE_LABELS: Record<InvitationRole, string> = {
  GUARDIAN: "Acudiente",
  ATHLETE: "Alumno",
  COACH: "Profesor",
};

export type InvitationState = "account" | "opened" | "sent" | "expired" | "none";

export const INVITATION_STATE_LABELS: Record<InvitationState, string> = {
  account: "Con cuenta",
  opened: "Invitación abierta",
  sent: "Invitación enviada",
  expired: "Invitación vencida",
  none: "Sin invitar",
};
