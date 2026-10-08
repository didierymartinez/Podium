import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  ageCategories,
  announcementRecipients,
  announcements,
  athleteGuardians,
  athletes,
  auditLogs,
  coaches,
  enrollments,
  groupCoaches,
  groups,
  guardians,
} from "@/db/schema";
import { todayIn, type IsoDate } from "@/lib/dates";
import { agingReport } from "@/modules/billing/statement";
import { notifyUsers } from "@/modules/notifications/notify";
import { findAgeCategory, sportsAge } from "@/modules/schools/age-category";

export const AUDIENCE_KINDS = {
  school: "Toda la escuela",
  groups: "Grupos",
  levels: "Niveles",
  categories: "Categorías por edad",
  debtors: "Familias con saldo vencido",
  people: "Personas elegidas",
} as const;
export type AudienceKind = keyof typeof AUDIENCE_KINDS;

/** Variables que se reemplazan por persona en el texto del aviso (COM-13). */
export const VARIABLES = {
  "{acudiente}": "Nombre del acudiente",
  "{alumnos}": "Nombres de sus hijos",
  "{grupo}": "Grupo(s)",
  "{escuela}": "Nombre de la escuela",
} as const;

export const announcementSchema = z.object({
  title: z.string().trim().min(3, "Escribe el título").max(80),
  body: z.string().trim().min(3, "Escribe el mensaje").max(2000),
  audience: z.object({
    kind: z.enum(Object.keys(AUDIENCE_KINDS) as [AudienceKind, ...AudienceKind[]]),
    ids: z.array(z.uuid()).max(500).default([]),
  }),
  urgent: z.boolean().default(false),
  pinnedUntil: z.iso.date().nullable().default(null),
});
export type AnnouncementInput = z.input<typeof announcementSchema>;

export type Recipient = {
  guardianId: string | null;
  athleteId: string | null;
  userId: string | null;
  name: string;
  phone: string | null;
  athletes: string[];
  groups: string[];
};

export function renderMessage(
  template: string,
  r: Pick<Recipient, "name" | "athletes" | "groups">,
  schoolName: string,
) {
  const first = r.name.split(" ")[0];
  return template
    .replaceAll("{acudiente}", first)
    .replaceAll("{alumnos}", r.athletes.join(", ") || first)
    .replaceAll("{grupo}", r.groups.join(", "))
    .replaceAll("{escuela}", schoolName);
}

/** Horario de avisos (COM-19): de 7 a. m. a 8 p. m.; fuera de él se programa para las 7 a. m. siguientes. */
export function nextAllowedTime(now: Date, timeZone: string): Date | null {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  if (hour >= 7 && hour < 20) return null;
  const today = todayIn(timeZone, now);
  const day =
    hour >= 20 ? new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : today;
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${day}T12:00:00Z`))
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "Z";
  return new Date(`${day}T07:00:00${offset}`);
}

/** Grupos de un profesor (titular o auxiliar): un profesor solo escribe a sus grupos (COM-18). */
export async function coachGroupIds(tx: Tx, userId: string) {
  const rows = await tx
    .select({ groupId: groupCoaches.groupId })
    .from(groupCoaches)
    .innerJoin(coaches, eq(coaches.id, groupCoaches.coachId))
    .where(and(eq(coaches.userId, userId), eq(coaches.active, true)));
  return rows.map((r) => r.groupId);
}

/** `IN ()` vacío no es SQL válido: una lista vacía no debe coincidir con nada. */
const NONE = "00000000-0000-0000-0000-000000000000";
const orNone = (ids: string[]) => (ids.length ? ids : [NONE]);

/** Destinatarios deduplicados: un acudiente recibe un solo aviso aunque tenga varios hijos (COM-16). */
export async function resolveRecipients(
  tx: Tx,
  audience: { kind: AudienceKind; ids: string[] },
  today: IsoDate,
): Promise<Recipient[]> {
  let athleteFilter: string[] | null = null;
  if (audience.kind === "categories") {
    const [cats, all] = await Promise.all([
      tx.select().from(ageCategories),
      tx.select({ id: athletes.id, birthDate: athletes.birthDate }).from(athletes),
    ]);
    const year = Number(today.slice(0, 4));
    athleteFilter = all
      .filter((a) => {
        const cat = findAgeCategory(sportsAge(a.birthDate, year), cats);
        return cat ? audience.ids.includes(cat.id) : false;
      })
      .map((a) => a.id);
  }
  let groupFilter: string[] | null = null;
  if (audience.kind === "groups") groupFilter = audience.ids;
  if (audience.kind === "levels") {
    groupFilter = (
      await tx
        .select({ id: groups.id })
        .from(groups)
        .where(inArray(groups.levelId, orNone(audience.ids)))
    ).map((g) => g.id);
  }

  const rows = await tx
    .select({
      athleteId: athletes.id,
      athleteFirst: athletes.firstName,
      athleteLast: athletes.lastName,
      athleteUserId: athletes.userId,
      athletePhone: athletes.phone,
      groupName: groups.name,
      guardianId: guardians.id,
      guardianFirst: guardians.firstName,
      guardianLast: guardians.lastName,
      guardianUserId: guardians.userId,
      guardianPhone: guardians.phone,
    })
    .from(enrollments)
    .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
    .innerJoin(groups, eq(groups.id, enrollments.groupId))
    .leftJoin(athleteGuardians, eq(athleteGuardians.athleteId, athletes.id))
    .leftJoin(guardians, eq(guardians.id, athleteGuardians.guardianId))
    .where(
      and(
        inArray(enrollments.status, ["ACTIVE", "PRE_ENROLLED"]),
        groupFilter ? inArray(enrollments.groupId, orNone(groupFilter)) : undefined,
        athleteFilter ? inArray(athletes.id, orNone(athleteFilter)) : undefined,
        audience.kind === "people"
          ? or(inArray(guardians.id, orNone(audience.ids)), inArray(athletes.id, orNone(audience.ids)))
          : undefined,
      ),
    );

  const byKey = new Map<string, Recipient>();
  for (const r of rows) {
    if (
      audience.kind === "people" &&
      r.guardianId &&
      !audience.ids.includes(r.guardianId) &&
      !audience.ids.includes(r.athleteId)
    ) {
      continue;
    }
    // Con acudiente: le llega al acudiente. Sin acudiente (adulto): al alumno.
    const key = r.guardianId ?? `athlete:${r.athleteId}`;
    const entry: Recipient = byKey.get(key) ?? {
      guardianId: r.guardianId,
      athleteId: r.guardianId ? null : r.athleteId,
      userId: r.guardianId ? r.guardianUserId : r.athleteUserId,
      name: r.guardianId ? `${r.guardianFirst} ${r.guardianLast}` : `${r.athleteFirst} ${r.athleteLast}`,
      phone: r.guardianId ? r.guardianPhone : r.athletePhone,
      athletes: [],
      groups: [],
    };
    if (!entry.athletes.includes(r.athleteFirst)) entry.athletes.push(r.athleteFirst);
    if (!entry.groups.includes(r.groupName)) entry.groups.push(r.groupName);
    byKey.set(key, entry);
    // El alumno con cuenta propia (mayor de 14 años) también recibe el aviso.
    if (r.guardianId && r.athleteUserId && !byKey.has(`athlete:${r.athleteId}`)) {
      byKey.set(`athlete:${r.athleteId}`, {
        guardianId: null,
        athleteId: r.athleteId,
        userId: r.athleteUserId,
        name: `${r.athleteFirst} ${r.athleteLast}`,
        phone: r.athletePhone,
        athletes: [r.athleteFirst],
        groups: [r.groupName],
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type Author = {
  schoolId: string;
  actorUserId: string;
  slug: string;
  schoolName: string;
  timeZone: string;
  isManager: boolean;
};

/**
 * Crea el aviso con su lista de destinatarios ya personalizada. Dentro del horario (o si es urgente) se
 * envía de una vez; fuera de él queda programado para las 7 a. m.
 */
export async function createAnnouncement(
  database: Database,
  author: Author,
  raw: AnnouncementInput,
  now = new Date(),
) {
  const input = announcementSchema.parse(raw);
  const today = todayIn(author.timeZone, now);
  const debtorIds =
    input.audience.kind === "debtors" && author.isManager
      ? (await agingReport(database, author.schoolId, today)).debtors
          .filter((d) => d.overdue > 0)
          .map((d) => d.guardianId)
      : [];
  return runInTenant(database, { schoolId: author.schoolId }, async (tx) => {
    let audience: { kind: AudienceKind; ids: string[] } = input.audience;
    if (!author.isManager) {
      const mine = await coachGroupIds(tx, author.actorUserId);
      const ids = audience.kind === "groups" ? audience.ids.filter((id) => mine.includes(id)) : mine;
      if (ids.length === 0) return { ok: false as const, error: "no_groups" as const };
      audience = { kind: "groups", ids };
    }
    const recipients = await resolveRecipients(
      tx,
      audience.kind === "debtors" ? { kind: "people", ids: debtorIds } : audience,
      today,
    );
    if (recipients.length === 0) return { ok: false as const, error: "no_recipients" as const };
    const scheduledFor = input.urgent ? null : nextAllowedTime(now, author.timeZone);
    const [row] = await tx
      .insert(announcements)
      .values({
        schoolId: author.schoolId,
        authorUserId: author.actorUserId,
        title: input.title,
        body: input.body,
        audience,
        urgent: input.urgent,
        pinnedUntil: input.pinnedUntil,
        scheduledFor,
        recipientCount: recipients.length,
      })
      .returning();
    await tx.insert(announcementRecipients).values(
      recipients.map((r) => ({
        schoolId: author.schoolId,
        announcementId: row.id,
        guardianId: r.guardianId,
        athleteId: r.athleteId,
        userId: r.userId,
        name: r.name,
        phone: r.phone,
        message: renderMessage(input.body, r, author.schoolName),
      })),
    );
    await tx.insert(auditLogs).values({
      schoolId: author.schoolId,
      actorUserId: author.actorUserId,
      action: "announcement.created",
      entity: "announcement",
      entityId: row.id,
      data: { title: input.title, audience, recipients: recipients.length, scheduledFor },
    });
    if (!scheduledFor) await dispatchTx(tx, author.schoolId, author.slug, row.id, now);
    return { ok: true as const, announcementId: row.id, scheduledFor };
  });
}

async function dispatchTx(tx: Tx, schoolId: string, slug: string, announcementId: string, now: Date) {
  const [row] = await tx.select().from(announcements).where(eq(announcements.id, announcementId));
  if (!row || row.sentAt) return 0;
  const recipients = await tx
    .select()
    .from(announcementRecipients)
    .where(eq(announcementRecipients.announcementId, announcementId));
  let sent = 0;
  for (const r of recipients) {
    if (!r.userId) continue;
    sent += await notifyUsers(tx, schoolId, [r.userId], {
      kind: row.urgent ? "announcement.urgent" : "announcement",
      title: row.title,
      body: r.message,
      href: `/${slug}/avisos/${row.id}`,
      dedupeKey: `announcement:${row.id}`,
    });
  }
  await tx.update(announcements).set({ sentAt: now }).where(eq(announcements.id, announcementId));
  return sent;
}

/** Tarea frecuente: envía los avisos programados cuya hora llegó. */
export function sendScheduledAnnouncements(
  database: Database,
  school: { id: string; slug: string },
  now: Date,
) {
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    const due = await tx
      .select({ id: announcements.id })
      .from(announcements)
      .where(and(isNull(announcements.sentAt), lte(announcements.scheduledFor, now)));
    for (const a of due) await dispatchTx(tx, school.id, school.slug, a.id, now);
    return due.length;
  });
}

export function listAnnouncements(
  database: Database,
  schoolId: string,
  filter: { authorUserId?: string } = {},
) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(announcements)
      .where(filter.authorUserId ? eq(announcements.authorUserId, filter.authorUserId) : undefined)
      .orderBy(desc(announcements.createdAt))
      .limit(100),
  );
}

export function getAnnouncement(database: Database, schoolId: string, id: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx.select().from(announcements).where(eq(announcements.id, id));
    if (!row) return null;
    const recipients = await tx
      .select()
      .from(announcementRecipients)
      .where(eq(announcementRecipients.announcementId, id))
      .orderBy(announcementRecipients.name);
    return { announcement: row, recipients };
  });
}

/** Avisos que recibió una persona (historial por persona): como acudiente o con su cuenta. */
export function receivedAnnouncements(
  database: Database,
  schoolId: string,
  who: { guardianId?: string; userId?: string },
) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({ announcement: announcements, message: announcementRecipients.message })
      .from(announcementRecipients)
      .innerJoin(announcements, eq(announcements.id, announcementRecipients.announcementId))
      .where(
        and(
          sql`${announcements.sentAt} is not null`,
          or(
            who.guardianId ? eq(announcementRecipients.guardianId, who.guardianId) : undefined,
            who.userId ? eq(announcementRecipients.userId, who.userId) : undefined,
          ),
        ),
      )
      .orderBy(desc(announcements.createdAt))
      .limit(50),
  );
}

/** Avisos fijados vigentes para el inicio. Con `userId`, solo los que esa persona recibió. */
export function pinnedAnnouncements(
  database: Database,
  schoolId: string,
  today: IsoDate,
  userId: string | null,
) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .selectDistinct({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        pinnedUntil: announcements.pinnedUntil,
      })
      .from(announcements)
      .leftJoin(announcementRecipients, eq(announcementRecipients.announcementId, announcements.id))
      .where(
        and(
          sql`${announcements.sentAt} is not null`,
          sql`${announcements.pinnedUntil} >= ${today}`,
          userId ? eq(announcementRecipients.userId, userId) : undefined,
        ),
      )
      .limit(3),
  );
}

export function markWhatsAppSent(database: Database, schoolId: string, recipientId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .update(announcementRecipients)
      .set({ whatsappSentAt: new Date() })
      .where(eq(announcementRecipients.id, recipientId)),
  );
}
