import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { allVisible } from "@/db/ownership";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  athleteGuardians,
  athletes,
  auditLogs,
  coaches,
  groupCoaches,
  groups,
  guardians,
  invitations,
  legalAcceptances,
  schoolMemberships,
  schools,
} from "@/db/schema";
import { LEGAL_VERSION } from "@/modules/auth/users";
import type { InvitationRole, InvitationState } from "./message";
import {
  INVITATION_TTL_DAYS,
  generateInvitationToken,
  hashInvitationToken,
  isWellFormedToken,
} from "./token";

type Ctx = { schoolId: string; actorUserId: string };

export type InvitationTarget =
  | { role: "GUARDIAN"; guardianId: string }
  | { role: "ATHLETE"; athleteId: string }
  | { role: "COACH"; coachId: string };

const DAY_MS = 86_400_000;

function targetColumns(target: InvitationTarget) {
  return {
    guardianId: target.role === "GUARDIAN" ? target.guardianId : null,
    athleteId: target.role === "ATHLETE" ? target.athleteId : null,
    coachId: target.role === "COACH" ? target.coachId : null,
  };
}

function targetCondition(target: InvitationTarget) {
  if (target.role === "GUARDIAN") return eq(invitations.guardianId, target.guardianId);
  if (target.role === "ATHLETE") return eq(invitations.athleteId, target.athleteId);
  return eq(invitations.coachId, target.coachId);
}

/** Persona invitada: nombre, contacto y si ya tiene cuenta. */
async function loadTarget(tx: Tx, target: InvitationTarget) {
  if (target.role === "GUARDIAN") {
    const [g] = await tx.select().from(guardians).where(eq(guardians.id, target.guardianId));
    if (!g) return null;
    const kids = await tx
      .select({ firstName: athletes.firstName })
      .from(athleteGuardians)
      .innerJoin(athletes, eq(athletes.id, athleteGuardians.athleteId))
      .where(eq(athleteGuardians.guardianId, g.id));
    return {
      firstName: g.firstName,
      lastName: g.lastName,
      phone: g.phone as string | null,
      email: g.email,
      userId: g.userId,
      athleteNames: kids.map((k) => k.firstName),
    };
  }
  if (target.role === "ATHLETE") {
    const [a] = await tx.select().from(athletes).where(eq(athletes.id, target.athleteId));
    if (!a) return null;
    return {
      firstName: a.firstName,
      lastName: a.lastName,
      phone: a.phone,
      email: a.email,
      userId: a.userId,
      athleteNames: [a.firstName],
    };
  }
  const [c] = await tx.select().from(coaches).where(eq(coaches.id, target.coachId));
  if (!c) return null;
  const coachGroups = await tx
    .select({ name: groups.name })
    .from(groupCoaches)
    .innerJoin(groups, eq(groups.id, groupCoaches.groupId))
    .where(eq(groupCoaches.coachId, c.id));
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone as string | null,
    email: c.email,
    userId: c.userId,
    athleteNames: coachGroups.map((g) => g.name),
  };
}

export type CreateInvitationResult =
  | {
      ok: true;
      token: string;
      expiresAt: Date;
      invitee: { firstName: string; phone: string | null; email: string | null; athleteNames: string[] };
      schoolName: string;
    }
  | { ok: false; error: "not_found" | "already_member" };

/**
 * Crea un link de invitación nuevo para la persona. Cualquier invitación pendiente anterior
 * para la misma persona se cancela (el link viejo deja de funcionar).
 */
export function createInvitation(
  database: Database,
  ctx: Ctx,
  target: InvitationTarget,
  now = new Date(),
): Promise<CreateInvitationResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const invitee = await loadTarget(tx, target);
    if (!invitee) return { ok: false, error: "not_found" };
    if (invitee.userId) return { ok: false, error: "already_member" };

    await tx
      .update(invitations)
      .set({ status: "CANCELED" })
      .where(and(targetCondition(target), eq(invitations.status, "PENDING")));

    const token = generateInvitationToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS);
    const [invitation] = await tx
      .insert(invitations)
      .values({
        schoolId: ctx.schoolId,
        role: target.role,
        ...targetColumns(target),
        tokenHash: hashInvitationToken(token),
        expiresAt,
        sentAt: now,
        createdByUserId: ctx.actorUserId,
      })
      .returning({ id: invitations.id });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "invitation.created",
      entity: "invitation",
      entityId: invitation.id,
      data: { role: target.role, ...targetColumns(target) },
    });
    const [school] = await tx
      .select({ name: schools.name })
      .from(schools)
      .where(eq(schools.id, ctx.schoolId));
    return {
      ok: true,
      token,
      expiresAt,
      invitee: {
        firstName: invitee.firstName,
        phone: invitee.phone,
        email: invitee.email,
        athleteNames: invitee.athleteNames,
      },
      schoolName: school.name,
    };
  });
}

export function cancelInvitation(database: Database, ctx: Ctx, invitationId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .update(invitations)
      .set({ status: "CANCELED" })
      .where(and(eq(invitations.id, invitationId), eq(invitations.status, "PENDING")))
      .returning({ id: invitations.id });
    if (row) {
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.actorUserId,
        action: "invitation.canceled",
        entity: "invitation",
        entityId: row.id,
      });
    }
    return Boolean(row);
  });
}

// ---------------------------------------------------------------------------
// Abrir y aceptar
// ---------------------------------------------------------------------------

async function schoolForToken(database: Database, token: string): Promise<string | null> {
  if (!isWellFormedToken(token)) return null;
  const rows = await database.execute<{ school_id: string | null }>(
    sql`select invitation_school(${hashInvitationToken(token)}) as school_id`,
  );
  return rows[0]?.school_id ?? null;
}

export type InvitationView =
  | { state: "not_found" }
  | {
      state: "valid" | "expired" | "accepted" | "canceled";
      role: InvitationRole;
      school: { name: string; slug: string; brandColor: string; city: string };
      invitee: { firstName: string; lastName: string };
      athleteNames: string[];
      expiresAt: Date;
    };

/** Lo que ve quien abre el link. Registra la primera apertura. */
export async function openInvitation(
  database: Database,
  token: string,
  now = new Date(),
): Promise<InvitationView> {
  const schoolId = await schoolForToken(database, token);
  if (!schoolId) return { state: "not_found" };
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx
      .select({ invitation: invitations, school: schools })
      .from(invitations)
      .innerJoin(schools, eq(schools.id, invitations.schoolId))
      .where(eq(invitations.tokenHash, hashInvitationToken(token)));
    if (!row) return { state: "not_found" };
    const { invitation, school } = row;
    const target = invitationTarget(invitation);
    const invitee = await loadTarget(tx, target);
    if (!invitee) return { state: "not_found" };

    const state =
      invitation.status === "ACCEPTED"
        ? "accepted"
        : invitation.status === "CANCELED"
          ? "canceled"
          : invitation.expiresAt < now
            ? "expired"
            : "valid";
    if (state === "valid" && !invitation.openedAt) {
      await tx.update(invitations).set({ openedAt: now }).where(eq(invitations.id, invitation.id));
    }
    return {
      state,
      role: invitation.role,
      school: { name: school.name, slug: school.slug, brandColor: school.brandColor, city: school.city },
      invitee: { firstName: invitee.firstName, lastName: invitee.lastName },
      athleteNames: invitee.athleteNames,
      expiresAt: invitation.expiresAt,
    };
  });
}

async function linkPerson(
  tx: Tx,
  target: InvitationTarget,
  userId: string,
): Promise<"ok" | "not_found" | "linked_to_other_user"> {
  const check = (row: { userId: string | null } | undefined) =>
    !row ? "not_found" : row.userId && row.userId !== userId ? "linked_to_other_user" : "ok";

  if (target.role === "GUARDIAN") {
    const [row] = await tx
      .select({ userId: guardians.userId })
      .from(guardians)
      .where(eq(guardians.id, target.guardianId));
    const result = check(row);
    if (result === "ok")
      await tx.update(guardians).set({ userId }).where(eq(guardians.id, target.guardianId));
    return result;
  }
  if (target.role === "ATHLETE") {
    const [row] = await tx
      .select({ userId: athletes.userId })
      .from(athletes)
      .where(eq(athletes.id, target.athleteId));
    const result = check(row);
    if (result === "ok") await tx.update(athletes).set({ userId }).where(eq(athletes.id, target.athleteId));
    return result;
  }
  const [row] = await tx
    .select({ userId: coaches.userId })
    .from(coaches)
    .where(eq(coaches.id, target.coachId));
  const result = check(row);
  if (result === "ok") await tx.update(coaches).set({ userId }).where(eq(coaches.id, target.coachId));
  return result;
}

function invitationTarget(i: typeof invitations.$inferSelect): InvitationTarget {
  if (i.role === "GUARDIAN") return { role: "GUARDIAN", guardianId: i.guardianId! };
  if (i.role === "ATHLETE") return { role: "ATHLETE", athleteId: i.athleteId! };
  return { role: "COACH", coachId: i.coachId! };
}

export type AcceptResult =
  | { ok: true; slug: string }
  | { ok: false; error: "not_found" | "expired" | "used" | "linked_to_other_user" };

/**
 * Acepta la invitación con la cuenta del usuario: vincula a la persona, crea o amplía la membresía
 * y guarda las autorizaciones de datos (y de WhatsApp, si la dio) para esa escuela.
 */
export async function acceptInvitation(
  database: Database,
  token: string,
  user: { id: string },
  consent: { whatsapp: boolean; ip: string | null },
  now = new Date(),
): Promise<AcceptResult> {
  const schoolId = await schoolForToken(database, token);
  if (!schoolId) return { ok: false, error: "not_found" };

  return runInTenant(database, { schoolId, userId: user.id }, async (tx) => {
    const [invitation] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashInvitationToken(token)))
      .for("update");
    if (!invitation) return { ok: false, error: "not_found" };
    if (invitation.status !== "PENDING") return { ok: false, error: "used" };
    if (invitation.expiresAt < now) return { ok: false, error: "expired" };

    // Vincular a la persona (si ya está vinculada a otra cuenta, no se puede reutilizar).
    const linked = await linkPerson(tx, invitationTarget(invitation), user.id);
    if (linked !== "ok") return { ok: false, error: linked };

    // Membresía: crear o agregar el rol.
    const [membership] = await tx
      .select()
      .from(schoolMemberships)
      .where(and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.userId, user.id)));
    if (membership) {
      const roles = membership.roles.includes(invitation.role)
        ? membership.roles
        : [...membership.roles, invitation.role];
      await tx
        .update(schoolMemberships)
        .set({ roles, status: "ACTIVE" })
        .where(eq(schoolMemberships.id, membership.id));
    } else {
      await tx.insert(schoolMemberships).values({ schoolId, userId: user.id, roles: [invitation.role] });
    }

    await tx
      .insert(legalAcceptances)
      .values([
        { userId: user.id, schoolId, document: "SCHOOL_DATA", version: LEGAL_VERSION, ip: consent.ip },
        ...(consent.whatsapp
          ? [{ userId: user.id, schoolId, document: "WHATSAPP", version: LEGAL_VERSION, ip: consent.ip }]
          : []),
      ]);

    await tx
      .update(invitations)
      .set({ status: "ACCEPTED", acceptedAt: now, acceptedByUserId: user.id })
      .where(eq(invitations.id, invitation.id));
    await tx.insert(auditLogs).values({
      schoolId,
      actorUserId: user.id,
      action: "invitation.accepted",
      entity: "invitation",
      entityId: invitation.id,
      data: { role: invitation.role, whatsapp: consent.whatsapp },
    });

    const [school] = await tx.select({ slug: schools.slug }).from(schools).where(eq(schools.id, schoolId));
    return { ok: true, slug: school.slug };
  });
}

// ---------------------------------------------------------------------------
// Estado para la escuela
// ---------------------------------------------------------------------------

type InvitationRow = typeof invitations.$inferSelect;

export function invitationState(
  hasAccount: boolean,
  latest: InvitationRow | undefined,
  now: Date,
): InvitationState {
  if (hasAccount) return "account";
  if (!latest || latest.status !== "PENDING") return "none";
  if (latest.expiresAt < now) return "expired";
  return latest.openedAt ? "opened" : "sent";
}

/** Estado de invitación por acudiente o profesor (id → estado). */
export async function invitationStates(
  database: Database,
  schoolId: string,
  kind: "GUARDIAN" | "COACH",
  people: { id: string; userId: string | null }[],
  now = new Date(),
): Promise<Map<string, InvitationState>> {
  const ids = people.map((p) => p.id);
  const column = kind === "GUARDIAN" ? invitations.guardianId : invitations.coachId;
  const rows = ids.length
    ? await runInTenant(database, { schoolId }, (tx) =>
        tx.select().from(invitations).where(inArray(column, ids)).orderBy(desc(invitations.createdAt)),
      )
    : [];
  const latest = new Map<string, InvitationRow>();
  for (const row of rows) {
    const key = (kind === "GUARDIAN" ? row.guardianId : row.coachId)!;
    if (!latest.has(key)) latest.set(key, row);
  }
  return new Map(people.map((p) => [p.id, invitationState(p.userId !== null, latest.get(p.id), now)]));
}

export type InvitationListItem = {
  id: string;
  role: InvitationRole;
  name: string;
  status: "PENDING" | "ACCEPTED" | "CANCELED";
  expired: boolean;
  sentAt: Date | null;
  openedAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
};

export function listInvitations(database: Database, schoolId: string, now = new Date()) {
  return runInTenant(database, { schoolId }, async (tx): Promise<InvitationListItem[]> => {
    const rows = await tx
      .select({
        invitation: invitations,
        guardianName: sql<string | null>`${guardians.firstName} || ' ' || ${guardians.lastName}`,
        athleteName: sql<string | null>`${athletes.firstName} || ' ' || ${athletes.lastName}`,
        coachName: sql<string | null>`${coaches.firstName} || ' ' || ${coaches.lastName}`,
      })
      .from(invitations)
      .leftJoin(guardians, eq(guardians.id, invitations.guardianId))
      .leftJoin(athletes, eq(athletes.id, invitations.athleteId))
      .leftJoin(coaches, eq(coaches.id, invitations.coachId))
      .orderBy(desc(invitations.createdAt))
      .limit(300);
    return rows.map(({ invitation: i, guardianName, athleteName, coachName }) => ({
      id: i.id,
      role: i.role,
      name: guardianName ?? athleteName ?? coachName ?? "—",
      status: i.status,
      expired: i.status === "PENDING" && i.expiresAt < now,
      sentAt: i.sentAt,
      openedAt: i.openedAt,
      acceptedAt: i.acceptedAt,
      createdAt: i.createdAt,
    }));
  });
}

/** Valida que la persona a invitar exista en la escuela (para acciones del servidor). */
export async function targetExists(database: Database, schoolId: string, target: InvitationTarget) {
  return runInTenant(database, { schoolId }, (tx) =>
    target.role === "GUARDIAN"
      ? allVisible(tx, guardians, [target.guardianId])
      : target.role === "ATHLETE"
        ? allVisible(tx, athletes, [target.athleteId])
        : allVisible(tx, coaches, [target.coachId]),
  );
}
