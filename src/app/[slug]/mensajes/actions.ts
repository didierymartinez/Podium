"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { verifyPhoneNumber } from "@/lib/whatsapp-cloud/cloud";
import { canManagePeople, canManageSettings } from "@/modules/schools/permissions";
import {
  accountSchema,
  assignConversation,
  connectSchoolNumber,
  replyToConversation,
  setSchoolNumberEnabled,
} from "@/modules/whatsapp/inbox";
import { getActionContext } from "../action-context";

const REPLY_ERRORS = {
  not_found: "La conversación no existe.",
  window_closed: "Pasaron más de 24 horas desde su último mensaje: escríbele con un aviso.",
  no_number: "Conecta el número de WhatsApp de la escuela en Configuración → Comunicaciones.",
  send_failed: "WhatsApp no aceptó el mensaje. Intenta de nuevo.",
} as const;

export async function replyAction(slug: string, conversationId: string, body: string) {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  if (!body.trim()) return { ok: false, message: "Escribe el mensaje." };
  const r = await replyToConversation(db, member.ctx, conversationId, body, new Date());
  if (!r.ok) return { ok: false, message: REPLY_ERRORS[r.error] };
  refresh();
  return { ok: true };
}

export async function assignAction(slug: string, conversationId: string, userId: string | null) {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return { ok: false };
  await assignConversation(db, member.ctx, conversationId, userId || null);
  refresh();
  return { ok: true };
}

export async function connectNumberAction(slug: string, input: unknown) {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const r = await connectSchoolNumber(db, member.ctx, parsed.data, (c) => verifyPhoneNumber(c));
  refresh();
  return r.ok
    ? { ok: true, message: `Número ${r.displayPhone} conectado.` }
    : { ok: false, message: r.error };
}

export async function toggleNumberAction(slug: string, enabled: boolean) {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return { ok: false };
  await setSchoolNumberEnabled(db, member.ctx, enabled);
  refresh();
  return { ok: true };
}
