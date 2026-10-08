import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { athleteGuardians, athletes, guardians, notifications, schoolMemberships } from "@/db/schema";

export type NotificationInput = {
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  /** Si se repite la clave para la misma persona, no se vuelve a avisar. */
  dedupeKey?: string;
};

/** Deja un aviso en la bandeja de cada persona con cuenta (los canales push/email lo recogen después). */
export async function notifyUsers(
  tx: Tx,
  schoolId: string,
  userIds: (string | null)[],
  input: NotificationInput,
) {
  const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (recipients.length === 0) return 0;
  const inserted = await tx
    .insert(notifications)
    .values(recipients.map((userId) => ({ schoolId, userId, ...input, href: input.href ?? null })))
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return inserted.length;
}

/** Cuentas de los acudientes de un alumno y del propio alumno si tiene cuenta. */
export async function familyUserIds(tx: Tx, athleteIds: string[]): Promise<string[]> {
  if (athleteIds.length === 0) return [];
  const [guardianRows, athleteRows] = await Promise.all([
    tx
      .select({ userId: guardians.userId })
      .from(athleteGuardians)
      .innerJoin(guardians, eq(guardians.id, athleteGuardians.guardianId))
      .where(and(inArray(athleteGuardians.athleteId, athleteIds), isNotNull(guardians.userId))),
    tx
      .select({ userId: athletes.userId })
      .from(athletes)
      .where(and(inArray(athletes.id, athleteIds), isNotNull(athletes.userId))),
  ]);
  return [...guardianRows, ...athleteRows].map((r) => r.userId!).filter(Boolean);
}

export function listNotifications(database: Database, schoolId: string, userId: string, limit = 30) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
  );
}

export async function unreadCount(database: Database, schoolId: string, userId: string) {
  const rows = await runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .limit(100),
  );
  return rows.length;
}

export function markAllRead(database: Database, schoolId: string, userId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  );
}

/** Cuentas de administración (propietario, administradores y coordinadores). */
export async function managerUserIds(tx: Tx): Promise<string[]> {
  const rows = await tx
    .select({ userId: schoolMemberships.userId, roles: schoolMemberships.roles })
    .from(schoolMemberships)
    .where(and(eq(schoolMemberships.status, "ACTIVE"), eq(schoolMemberships.schoolId, sql`app_school_id()`)));
  return rows.filter((r) => r.roles.some((role) => MANAGER_ROLES.includes(role))).map((r) => r.userId);
}

const MANAGER_ROLES: string[] = ["OWNER", "ADMIN", "COORDINATOR"];
