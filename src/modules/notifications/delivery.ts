import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import {
  guardians,
  legalAcceptances,
  notifications,
  pushSubscriptions,
  schoolMemberships,
  schools,
  subscriptions,
  users,
} from "@/db/schema";
import type { Mailer } from "@/lib/mailer/types";
import { emailLayout } from "@/lib/mailer/templates";
import type { Notifier } from "@/lib/notifier/types";
import { templateParam, waNumber } from "@/lib/whatsapp-cloud/cloud";
import type { WhatsAppSender } from "@/lib/whatsapp-cloud/types";
import { whatsappQuota } from "@/modules/subscription/plans";
import { allows, readPreferences } from "./preferences";

export type DeliveryChannels = {
  mailer: Mailer;
  notifier: Notifier | null;
  appUrl: string;
  /** WhatsApp automático (#64); sin credenciales la cascada es push → correo. */
  whatsapp?: { sender: WhatsAppSender; template: { name: string; language: string } } | null;
};

/** Horario permitido para WhatsApp no urgente (COM-32): 7 a. m. a 8 p. m. en la zona de la escuela. */
export function withinMessagingHours(now: Date, timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  return hour >= 7 && hour < 20;
}

/** Urgentes (COM-34): cambios de clase del día; se envían a cualquier hora. */
const isUrgent = (kind: string) => kind.startsWith("session.");

/**
 * Entrega la bandeja pendiente de una escuela en cascada (COM-13): push si la persona tiene dispositivos y
 * lo permite; si no, WhatsApp (con consentimiento, en horario y dentro del cupo del plan); si no, correo.
 * Cada aviso se procesa una sola vez (`delivered_at`); el que espera horario para WhatsApp queda en cola.
 */
export async function deliverPending(
  database: Database,
  channels: DeliveryChannels,
  schoolId: string,
  now: Date = new Date(),
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [school] = await tx
      .select({
        name: schools.name,
        brandColor: schools.brandColor,
        commsEnabledAt: schools.commsEnabledAt,
        timezone: schools.timezone,
      })
      .from(schools)
      .where(eq(schools.id, schoolId));
    if (!school) return 0;
    // Hasta activar comunicaciones (paso 7 del onboarding) solo se escribe al equipo de la escuela.
    const staff = new Set(
      (
        await tx
          .select({ userId: schoolMemberships.userId, roles: schoolMemberships.roles })
          .from(schoolMemberships)
          .where(and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.status, "ACTIVE")))
      )
        .filter((m) => m.roles.some((r) => r !== "GUARDIAN" && r !== "ATHLETE"))
        .map((m) => m.userId),
    );
    const pending = await tx
      .select({
        n: notifications,
        email: users.email,
        verified: users.emailVerifiedAt,
        prefs: users.notificationPrefs,
      })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.userId))
      .where(
        and(
          isNull(notifications.deliveredAt),
          gte(notifications.createdAt, new Date(now.getTime() - 3 * 86_400_000)),
        ),
      )
      .orderBy(asc(notifications.createdAt))
      .limit(300);
    if (pending.length === 0) return 0;
    const userIds = [...new Set(pending.map((p) => p.n.userId))];
    const tokenRows = channels.notifier
      ? await tx.execute<{ user_id: string; token: string }>(
          sql`select user_id, token from push_tokens_for(array[${sql.join(
            userIds.map((id) => sql`${id}`),
            sql`, `,
          )}]::uuid[])`,
        )
      : [];
    const tokensOf = (userId: string) =>
      [...tokenRows].filter((r) => r.user_id === userId).map((r) => r.token);

    // WhatsApp: celular, consentimiento vigente en esta escuela y cupo mensual del plan.
    const wa = channels.whatsapp ?? null;
    const phoneOf = new Map<string, string>();
    const consented = new Set<string>();
    let quotaLeft = 0;
    if (wa) {
      const [phones, consents, [plan], [{ used }]] = await Promise.all([
        tx
          .select({ userId: guardians.userId, phone: guardians.phone })
          .from(guardians)
          .where(inArray(guardians.userId, userIds)),
        tx
          .select({ userId: legalAcceptances.userId })
          .from(legalAcceptances)
          .where(
            and(
              eq(legalAcceptances.schoolId, schoolId),
              eq(legalAcceptances.document, "WHATSAPP"),
              isNull(legalAcceptances.revokedAt),
              inArray(legalAcceptances.userId, userIds),
            ),
          ),
        tx
          .select({ planCode: subscriptions.planCode })
          .from(subscriptions)
          .where(eq(subscriptions.schoolId, schoolId)),
        tx
          .select({ used: sql<number>`count(*)::int` })
          .from(notifications)
          .where(
            gte(notifications.whatsappSentAt, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
          ),
      ]);
      const userPhones = await tx
        .select({ id: users.id, phone: users.phone })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const u of userPhones) if (waNumber(u.phone)) phoneOf.set(u.id, waNumber(u.phone)!);
      for (const g of phones) if (g.userId && waNumber(g.phone)) phoneOf.set(g.userId, waNumber(g.phone)!);
      for (const c of consents) consented.add(c.userId);
      quotaLeft = whatsappQuota(plan?.planCode ?? null) - used;
    }
    const inHours = withinMessagingHours(now, school.timezone);

    let delivered = 0;
    for (const { n, email, verified, prefs: rawPrefs } of pending) {
      const prefs = readPreferences(rawPrefs);
      const message = { title: n.title, body: n.body, href: n.href ?? "/" };
      let via: "push" | "whatsapp" | "email" | "none" = "none";
      const reachable = school.commsEnabledAt !== null || staff.has(n.userId);
      if (reachable && channels.notifier && allows(prefs, n.kind, "push")) {
        for (const token of tokensOf(n.userId)) {
          const result = await channels.notifier.send(token, message);
          if (result === "sent") via = "push";
          if (result === "invalid_token") await tx.execute(sql`select forget_push_token(${token})`);
        }
      }
      const phone = phoneOf.get(n.userId);
      let waUpdate: Partial<typeof notifications.$inferInsert> = {};
      if (
        wa &&
        reachable &&
        via === "none" &&
        phone &&
        consented.has(n.userId) &&
        quotaLeft > 0 &&
        allows(prefs, n.kind, "whatsapp")
      ) {
        // Fuera de horario queda en cola para la siguiente entrega (COM-32), salvo urgentes.
        if (!inHours && !isUrgent(n.kind)) continue;
        const result = await wa.sender.sendTemplate({
          to: phone,
          template: wa.template.name,
          language: wa.template.language,
          params: [
            templateParam(school.name, 60),
            templateParam(`${n.title}. ${n.body}`),
            new URL(n.href ?? "/", channels.appUrl).toString(),
          ],
        });
        if (result.ok) {
          via = "whatsapp";
          quotaLeft--;
          waUpdate = { whatsappSentAt: now, whatsappMessageId: result.id, whatsappStatus: "sent" };
        } else {
          waUpdate = { whatsappStatus: "failed", whatsappError: result.error.slice(0, 300) };
        }
      }
      if (reachable && via === "none" && verified && allows(prefs, n.kind, "email")) {
        const { html, text } = emailLayout({
          brand: { name: school.name, color: school.brandColor },
          title: n.title,
          paragraphs: n.body.split("\n").filter(Boolean),
          cta: n.href
            ? { label: "Abrir en Podium", href: new URL(n.href, channels.appUrl).toString() }
            : null,
          footer: `Recibes este correo por tu relación con ${school.name}. Puedes cambiar qué avisos recibes en Mis datos.`,
        });
        const sent = await channels.mailer.send({ to: email, subject: n.title, html, text });
        if (sent.ok) via = "email";
      }
      await tx
        .update(notifications)
        .set({
          deliveredAt: now,
          deliveredVia: via,
          ...waUpdate,
          ...(via === "push" ? { pushSentAt: now } : {}),
          ...(via === "email" ? { emailSentAt: now } : {}),
        })
        .where(eq(notifications.id, n.id));
      if (via !== "none") delivered++;
    }
    return delivered;
  });
}

/**
 * Registra el token push del dispositivo. Si el token estaba a nombre de otra persona (otra cuenta en el
 * mismo navegador), se libera primero.
 */
export async function registerPushToken(
  database: Database,
  userId: string,
  token: string,
  userAgent: string | null,
) {
  await runInTenant(database, { userId }, async (tx) => {
    await tx.execute(sql`select forget_push_token(${token})`);
    await tx.insert(pushSubscriptions).values({ userId, token, userAgent });
  });
}

export async function updatePreferences(database: Database, userId: string, prefs: unknown) {
  await database
    .update(users)
    .set({ notificationPrefs: readPreferences(prefs) })
    .where(eq(users.id, userId));
}
