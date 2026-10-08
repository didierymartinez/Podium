"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { whatsappLink } from "@/lib/whatsapp";
import { cancelInvitation, createInvitation, type InvitationTarget } from "@/modules/invitations/invitations";
import { invitationMessage } from "@/modules/invitations/message";
import { canManagePeople, canManageSettings } from "@/modules/schools/permissions";
import { getActionContext } from "../action-context";

export type ShareInvitationResult =
  | {
      ok: true;
      link: string;
      message: string;
      whatsappUrl: string | null;
      mailtoUrl: string | null;
      expiresAt: string;
    }
  | { ok: false; message: string };

async function appOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? `https://${h.get("host")}`;
}

/** Genera un link de invitación nuevo (invalida el anterior) y lo prepara para compartir. */
export async function shareInvitationAction(
  slug: string,
  target: InvitationTarget,
): Promise<ShareInvitationResult> {
  // Invitar profesores es de propietario/administrador; acudientes y alumnos también del coordinador.
  const manager = await getActionContext(slug, target.role === "COACH" ? canManageSettings : canManagePeople);
  if (!manager) return { ok: false, message: "No tienes permiso para invitar." };

  const result = await createInvitation(db, manager.ctx, target);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.error === "already_member"
          ? "Esta persona ya tiene cuenta en la escuela."
          : "No encontramos a la persona.",
    };
  }
  const link = `${await appOrigin()}/i/${result.token}`;
  const message = invitationMessage({
    role: target.role,
    schoolName: result.schoolName,
    inviteeFirstName: result.invitee.firstName,
    athleteNames: result.invitee.athleteNames,
    link,
  });
  refresh();
  return {
    ok: true,
    link,
    message,
    whatsappUrl: result.invitee.phone ? whatsappLink(result.invitee.phone, message) : null,
    mailtoUrl: result.invitee.email
      ? `mailto:${result.invitee.email}?subject=${encodeURIComponent(`Invitación de ${result.schoolName}`)}&body=${encodeURIComponent(message)}`
      : null,
    expiresAt: result.expiresAt.toISOString(),
  };
}

export async function cancelInvitationAction(slug: string, invitationId: string) {
  const manager = await getActionContext(slug, canManagePeople);
  if (!manager) return { ok: false };
  await cancelInvitation(db, manager.ctx, invitationId);
  refresh();
  return { ok: true };
}
