import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { requireVerifiedUser } from "@/modules/auth/session";
import { getMemberSchool } from "@/modules/schools/queries";

/** Escuela actual + roles del usuario; 404 si no es miembro (no revela si existe). */
export const getSchoolContext = cache(async (slug: string) => {
  const user = await requireVerifiedUser();
  const member = await getMemberSchool(db, slug, user.id);
  if (!member) notFound();
  return { user, school: member.school, roles: member.roles };
});
