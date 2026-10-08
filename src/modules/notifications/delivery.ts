import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { notifications, pushSubscriptions, schoolMemberships, schools, users } from "@/db/schema";
import type { Mailer } from "@/lib/mailer/types";
import { emailLayout } from "@/lib/mailer/templates";
import type { Notifier } from "@/lib/notifier/types";
import { allows, readPreferences } from "./preferences";

export type DeliveryChannels = { mailer: Mailer; notifier: Notifier | null; appUrl: string };

/**
 * Entrega la bandeja pendiente de una escuela en cascada: push si la persona tiene dispositivos y lo
 * permite; si no, correo. Cada aviso se procesa una sola vez (`delivered_at`).
 */
export async function deliverPending(
  database: Database,
  channels: DeliveryChannels,
  schoolId: string,
  now: Date = new Date(),
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [school] = await tx
      .select({ name: schools.name, brandColor: schools.brandColor, commsEnabledAt: schools.commsEnabledAt })
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

    let delivered = 0;
    for (const { n, email, verified, prefs: rawPrefs } of pending) {
      const prefs = readPreferences(rawPrefs);
      const message = { title: n.title, body: n.body, href: n.href ?? "/" };
      let via: "push" | "email" | "none" = "none";
      const reachable = school.commsEnabledAt !== null || staff.has(n.userId);
      if (reachable && channels.notifier && allows(prefs, n.kind, "push")) {
        for (const token of tokensOf(n.userId)) {
          const result = await channels.notifier.send(token, message);
          if (result === "sent") via = "push";
          if (result === "invalid_token") await tx.execute(sql`select forget_push_token(${token})`);
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
