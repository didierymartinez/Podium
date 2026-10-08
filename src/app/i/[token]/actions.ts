"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireVerifiedUser } from "@/modules/auth/session";
import { acceptInvitation } from "@/modules/invitations/invitations";

const ERRORS = {
  not_found: "Esta invitación no existe.",
  expired: "Esta invitación venció. Pide a la escuela que te envíe una nueva.",
  used: "Esta invitación ya fue usada o cancelada.",
  linked_to_other_user: "Esta persona ya está vinculada a otra cuenta. Escríbele a la escuela.",
} as const;

export async function acceptInvitationAction(
  token: string,
  _prev: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const user = await requireVerifiedUser();
  if (form.get("dataConsent") !== "on") {
    return { error: "Debes autorizar el tratamiento de datos para continuar." };
  }
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const result = await acceptInvitation(db, token, user, {
    whatsapp: form.get("whatsappConsent") === "on",
    ip,
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  redirect(`/${result.slug}`);
}
