"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import {
  announcementSchema,
  createAnnouncement,
  markWhatsAppSent,
} from "@/modules/announcements/announcements";
import { canManagePeople, type SchoolRole } from "@/modules/schools/permissions";
import { deliverSoon } from "../../deliver";
import { FORBIDDEN_STATE, getActionContext, type ActionState } from "../action-context";

const canAnnounce = (roles: readonly SchoolRole[]) => canManagePeople(roles) || roles.includes("COACH");

export async function createAnnouncementAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const member = await getActionContext(slug, canAnnounce);
  if (!member) return FORBIDDEN_STATE;
  const parsed = announcementSchema.safeParse({
    title: String(form.get("title") ?? ""),
    body: String(form.get("body") ?? ""),
    audience: { kind: String(form.get("audience") ?? "school"), ids: form.getAll("ids").map(String) },
    urgent: form.get("urgent") === "on",
    pinnedUntil: String(form.get("pinnedUntil") ?? "") || null,
  });
  if (!parsed.success)
    return {
      ok: false,
      message: "Revisa los campos marcados",
      errors: z.flattenError(parsed.error).fieldErrors,
    };
  const result = await createAnnouncement(
    db,
    {
      schoolId: member.school.id,
      actorUserId: member.user.id,
      slug,
      schoolName: member.school.name,
      timeZone: member.school.timezone,
      isManager: canManagePeople(member.roles),
    },
    parsed.data,
  );
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.error === "no_groups" ? "No tienes grupos asignados." : "No hay familias en esa audiencia.",
    };
  }
  deliverSoon(member.school.id);
  redirect(`/${slug}/avisos/${result.announcementId}`);
}

export async function markWhatsAppSentAction(slug: string, recipientId: string) {
  const member = await getActionContext(slug, canAnnounce);
  if (!member) return FORBIDDEN_STATE;
  await markWhatsAppSent(db, member.school.id, recipientId);
  return { ok: true };
}
