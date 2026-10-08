import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { pgErrorCode, runInTenant, type Database, type Tx } from "@/db/rls";
import {
  auditLogs,
  guardians,
  schoolMemberships,
  users,
  whatsappAccounts,
  whatsappConversations,
  whatsappMessages,
} from "@/db/schema";
import { decryptField, encryptField } from "@/lib/crypto";
import { cloudSender } from "@/lib/whatsapp-cloud/cloud";
import type { WhatsAppSender } from "@/lib/whatsapp-cloud/types";

/** Número propio de WhatsApp de la escuela y bandeja de entrada (WHATSAPP_COMUNICACIONES §2, Fase 3). */

type Ctx = { schoolId: string; actorUserId: string };

/** Ventana de Meta para responder con texto libre después del último mensaje del contacto. */
export const REPLY_WINDOW_MS = 24 * 3_600_000;

export const accountSchema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, "Escribe el id del número (solo dígitos)"),
  businessAccountId: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, "Escribe el id de la cuenta de WhatsApp Business"),
  token: z.string().trim().min(20, "Escribe el token de acceso").max(600),
  template: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,60}$/, "La plantilla usa minúsculas, números y _")
    .default("aviso_podium"),
});

export type Verify = (config: {
  token: string;
  phoneNumberId: string;
}) => Promise<{ ok: true; displayPhone: string } | { ok: false; error: string }>;

export async function connectSchoolNumber(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof accountSchema>,
  verify: Verify,
  now: Date = new Date(),
) {
  const input = accountSchema.parse(raw);
  const check = await verify(input);
  if (!check.ok) return { ok: false as const, error: check.error };
  try {
    await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      const values = {
        phoneNumberId: input.phoneNumberId,
        businessAccountId: input.businessAccountId,
        displayPhone: check.displayPhone,
        tokenEncrypted: encryptField(input.token)!,
        template: input.template,
        enabled: true,
        verifiedAt: now,
      };
      await tx
        .insert(whatsappAccounts)
        .values({ schoolId: ctx.schoolId, ...values })
        .onConflictDoUpdate({ target: whatsappAccounts.schoolId, set: values });
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.actorUserId,
        action: "whatsapp.number_connected",
        entity: "school",
        entityId: ctx.schoolId,
        data: { phoneNumberId: input.phoneNumberId, displayPhone: check.displayPhone },
      });
    });
  } catch (err) {
    // El mismo número no puede estar en dos escuelas.
    if (pgErrorCode(err) === "23505")
      return { ok: false as const, error: "Ese número ya está conectado a otra escuela." };
    throw err;
  }
  return { ok: true as const, displayPhone: check.displayPhone };
}

export function setSchoolNumberEnabled(database: Database, ctx: Ctx, enabled: boolean) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.update(whatsappAccounts).set({ enabled }).where(eq(whatsappAccounts.schoolId, ctx.schoolId));
  });
}

export function getSchoolNumber(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.schoolId, schoolId));
    return row
      ? {
          phoneNumberId: row.phoneNumberId,
          businessAccountId: row.businessAccountId,
          displayPhone: row.displayPhone,
          template: row.template,
          enabled: row.enabled,
        }
      : null;
  });
}

/** Remitente con el número de la escuela (si lo conectó y está activo). */
export async function schoolSenderTx(
  tx: Tx,
  schoolId: string,
  fetchImpl?: typeof fetch,
): Promise<{ sender: WhatsAppSender; template: { name: string; language: string } } | null> {
  const [row] = await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.schoolId, schoolId));
  const token = row?.enabled ? decryptField(row.tokenEncrypted) : null;
  if (!row || !token) return null;
  return {
    sender: cloudSender({ token, phoneNumberId: row.phoneNumberId }, fetchImpl),
    template: { name: row.template, language: "es" },
  };
}

/** Conversaciones con el nombre del acudiente cuando el celular está registrado. */
export function listConversations(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select()
      .from(whatsappConversations)
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(100);
    const known = rows.length
      ? await tx
          .select({ phone: guardians.phone, firstName: guardians.firstName, lastName: guardians.lastName })
          .from(guardians)
          .where(
            inArray(
              guardians.phone,
              rows.map((r) => r.contactPhone),
            ),
          )
      : [];
    return rows.map((r) => {
      const g = known.find((k) => k.phone === r.contactPhone);
      return { ...r, guardianName: g ? `${g.firstName} ${g.lastName}` : null };
    });
  });
}

/** Mensajes de una conversación; al abrirla quedan leídos. */
export function openConversation(database: Database, schoolId: string, conversationId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [conversation] = await tx
      .update(whatsappConversations)
      .set({ unread: 0 })
      .where(eq(whatsappConversations.id, conversationId))
      .returning();
    if (!conversation) return null;
    const messages = await tx
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(asc(whatsappMessages.createdAt));
    return { conversation, messages };
  });
}

export const canReply = (lastInboundAt: Date | null, now: Date) =>
  lastInboundAt !== null && now.getTime() - lastInboundAt.getTime() <= REPLY_WINDOW_MS;

export type ReplyResult =
  { ok: true } | { ok: false; error: "not_found" | "window_closed" | "no_number" | "send_failed" };

/** Respuesta en texto libre dentro de la ventana de 24 h, desde el número de la escuela. */
export function replyToConversation(
  database: Database,
  ctx: Ctx,
  conversationId: string,
  body: string,
  now: Date,
  fetchImpl?: typeof fetch,
): Promise<ReplyResult> {
  const text = z.string().trim().min(1).max(2000).parse(body);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx): Promise<ReplyResult> => {
    const [conversation] = await tx
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.id, conversationId));
    if (!conversation) return { ok: false, error: "not_found" };
    if (!canReply(conversation.lastInboundAt, now)) return { ok: false, error: "window_closed" };
    const school = await schoolSenderTx(tx, ctx.schoolId, fetchImpl);
    if (!school) return { ok: false, error: "no_number" };
    const sent = await school.sender.sendText(conversation.contactPhone.replace(/\D/g, ""), text);
    if (!sent.ok) return { ok: false, error: "send_failed" };
    await tx.insert(whatsappMessages).values({
      schoolId: ctx.schoolId,
      conversationId,
      direction: "OUT",
      body: text,
      waMessageId: sent.id,
      status: "sent",
      sentByUserId: ctx.actorUserId,
      createdAt: now,
    });
    await tx
      .update(whatsappConversations)
      .set({ lastMessageAt: now })
      .where(eq(whatsappConversations.id, conversationId));
    return { ok: true };
  });
}

export function assignConversation(
  database: Database,
  ctx: Ctx,
  conversationId: string,
  userId: string | null,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const updated = await tx
      .update(whatsappConversations)
      .set({ assignedUserId: userId })
      .where(and(eq(whatsappConversations.id, conversationId)))
      .returning();
    return updated.length > 0;
  });
}

export function unreadConversations(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx.select({ unread: whatsappConversations.unread }).from(whatsappConversations);
    return rows.filter((r) => r.unread > 0).length;
  });
}

/** Equipo de la escuela (para asignar conversaciones). */
export function staffMembers(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({ id: users.id, name: users.name, roles: schoolMemberships.roles })
      .from(schoolMemberships)
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .where(and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.status, "ACTIVE")))
      .orderBy(asc(users.name));
    return rows
      .filter((r) => r.roles.some((role) => role !== "GUARDIAN" && role !== "ATHLETE"))
      .map(({ id, name }) => ({ id, name }));
  });
}
