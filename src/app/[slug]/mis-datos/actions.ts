"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { asPortalUser } from "@/db/portal";
import { users } from "@/db/schema";
import { normalizeColombianMobile } from "@/lib/phone";
import { setImageConsent } from "@/modules/documents/documents";
import { guardianIdsOfUser } from "@/modules/portal/family";
import { requestDeletion, setWhatsAppConsent } from "@/modules/portal/privacy";
import { deliverSoon } from "../../deliver";
import { db } from "@/db/client";
import { registerPushToken, updatePreferences } from "@/modules/notifications/delivery";
import { getActionContext, type ActionState } from "../action-context";

const anyMember = () => true;

export async function registerPushTokenAction(
  slug: string,
  token: string,
  userAgent: string,
): Promise<ActionState> {
  const member = await getActionContext(slug, anyMember);
  if (!member) return { ok: false, message: "Inicia sesión de nuevo." };
  if (!/^[\w:-]{20,4096}$/.test(token)) return { ok: false, message: "Token inválido" };
  await registerPushToken(db, member.user.id, token, userAgent.slice(0, 300));
  return { ok: true };
}

export async function savePreferencesAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const member = await getActionContext(slug, anyMember);
  if (!member) return { ok: false, message: "Inicia sesión de nuevo." };
  const flag = (topic: string, channel: string) => form.get(`${topic}.${channel}`) === "on";
  await updatePreferences(db, member.user.id, {
    billing: { push: flag("billing", "push"), email: flag("billing", "email") },
    attendance: { push: flag("attendance", "push"), email: flag("attendance", "email") },
    notices: { push: flag("notices", "push"), email: flag("notices", "email") },
  });
  refresh();
  return { ok: true, message: "Preferencias guardadas" };
}

export async function updateProfileAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const member = await getActionContext(slug, anyMember);
  if (!member) return { ok: false, message: "Inicia sesión de nuevo." };
  const name = String(form.get("name") ?? "").trim();
  const rawPhone = String(form.get("phone") ?? "").trim();
  if (name.length < 2) return { ok: false, errors: { name: ["Escribe tu nombre"] } };
  const phone = rawPhone ? normalizeColombianMobile(rawPhone) : null;
  if (rawPhone && !phone) return { ok: false, errors: { phone: ["Celular colombiano no válido"] } };
  await db
    .update(users)
    .set({ name: name.slice(0, 80), phone })
    .where(eq(users.id, member.user.id));
  refresh();
  return { ok: true, message: "Guardado" };
}

export async function setWhatsAppConsentAction(slug: string, granted: boolean): Promise<ActionState> {
  const member = await getActionContext(slug, anyMember);
  if (!member) return { ok: false };
  const h = await headers();
  await setWhatsAppConsent(
    db,
    member.school.id,
    member.user.id,
    granted,
    h.get("x-forwarded-for")?.split(",")[0] ?? null,
  );
  refresh();
  return { ok: true };
}

/** El acudiente decide el uso de imagen de sus hijos (ADM-71); RLS de familia limita a los suyos. */
export async function setImageConsentForKidAction(
  slug: string,
  athleteId: string,
  consent: "GRANTED" | "DENIED",
): Promise<ActionState> {
  const member = await getActionContext(slug, anyMember);
  if (!member) return { ok: false };
  const mine = await guardianIdsOfUser(db, member.school.id, member.user.id);
  if (!mine.length) return { ok: false };
  await asPortalUser(member.user.id, () => setImageConsent(db, member.ctx, athleteId, consent));
  refresh();
  return { ok: true };
}

export async function requestDeletionAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const member = await getActionContext(slug, anyMember);
  if (!member) return { ok: false };
  await requestDeletion(db, member.school, member.user, String(form.get("reason") ?? "").trim());
  deliverSoon(member.school.id);
  return { ok: true, message: "Solicitud enviada a la escuela" };
}
