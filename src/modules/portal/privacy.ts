import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { athleteGuardians, athletes, auditLogs, guardians, legalAcceptances, users } from "@/db/schema";
import { managerUserIds, notifyUsers } from "@/modules/notifications/notify";

export const CONSENT_LABELS: Record<string, string> = {
  TERMS: "Términos del servicio de Podium",
  PRIVACY: "Política de tratamiento de datos de Podium",
  SCHOOL_DATA: "Tratamiento de datos por la escuela",
  WHATSAPP: "Mensajes por WhatsApp de la escuela",
};

/** Autorizaciones de la persona: las de la plataforma y las de esta escuela (Ley 1581). */
export function listConsents(database: Database, schoolId: string, userId: string) {
  return database
    .select()
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.userId, userId),
        or(isNull(legalAcceptances.schoolId), eq(legalAcceptances.schoolId, schoolId)),
      ),
    )
    .orderBy(legalAcceptances.acceptedAt);
}

/** Otorga o revoca la autorización de WhatsApp de esta escuela; la revocación conserva la fila. */
export async function setWhatsAppConsent(
  database: Database,
  schoolId: string,
  userId: string,
  granted: boolean,
  ip: string | null,
) {
  const current = await database
    .select()
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.userId, userId),
        eq(legalAcceptances.schoolId, schoolId),
        eq(legalAcceptances.document, "WHATSAPP"),
        isNull(legalAcceptances.revokedAt),
      ),
    );
  if (granted && current.length === 0) {
    await database
      .insert(legalAcceptances)
      .values({ userId, schoolId, document: "WHATSAPP", version: "2026-10", ip });
  }
  if (!granted && current.length) {
    await database
      .update(legalAcceptances)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(legalAcceptances.userId, userId),
          eq(legalAcceptances.schoolId, schoolId),
          eq(legalAcceptances.document, "WHATSAPP"),
          isNull(legalAcceptances.revokedAt),
        ),
      );
  }
}

/** Derecho de acceso: los datos personales de la persona y de los alumnos a su cargo en esta escuela. */
export async function exportMyData(database: Database, schoolId: string, userId: string) {
  const [user] = await database.select().from(users).where(eq(users.id, userId));
  const consents = await listConsents(database, schoolId, userId);
  const family = await runInTenant(database, { schoolId }, async (tx) => {
    const myGuardians = await tx.select().from(guardians).where(eq(guardians.userId, userId));
    const kids = myGuardians.length
      ? await tx
          .select({ athlete: athletes, relationship: athleteGuardians.relationship })
          .from(athleteGuardians)
          .innerJoin(athletes, eq(athletes.id, athleteGuardians.athleteId))
          .where(eq(athleteGuardians.guardianId, myGuardians[0].id))
      : [];
    const asAthlete = await tx.select().from(athletes).where(eq(athletes.userId, userId));
    return { myGuardians, kids, asAthlete };
  });
  const clean = (a: typeof athletes.$inferSelect) => {
    const { medicalNotesEncrypted, ...rest } = a;
    return { ...rest, medicalNotes: medicalNotesEncrypted ? "(registrada; pídela a la escuela)" : null };
  };
  return {
    generatedAt: new Date().toISOString(),
    user: user && { name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt },
    consents: consents.map((c) => ({
      document: c.document,
      version: c.version,
      acceptedAt: c.acceptedAt,
      revokedAt: c.revokedAt,
    })),
    guardian: family.myGuardians.map(
      ({ id, firstName, lastName, documentType, documentNumber, phone, email }) => ({
        id,
        firstName,
        lastName,
        documentType,
        documentNumber,
        phone,
        email,
      }),
    ),
    athletes: [
      ...family.kids.map((k) => ({ ...clean(k.athlete), relationship: k.relationship })),
      ...family.asAthlete.map(clean),
    ],
  };
}

/** Solicitud de supresión (Ley 1581): avisa a la administración y queda auditada. */
export function requestDeletion(
  database: Database,
  school: { id: string; slug: string },
  user: { id: string; name: string },
  reason: string,
) {
  return runInTenant(database, { schoolId: school.id }, async (tx) => {
    await tx.insert(auditLogs).values({
      schoolId: school.id,
      actorUserId: user.id,
      action: "privacy.deletion_requested",
      entity: "user",
      entityId: user.id,
      data: { reason: reason.slice(0, 500) },
    });
    await notifyUsers(tx, school.id, await managerUserIds(tx), {
      kind: "privacy.deletion_request",
      title: `${user.name} pidió eliminar sus datos`,
      body: `Motivo: ${reason || "sin motivo"}. Respóndele en máximo 15 días hábiles (Ley 1581).`,
      href: `/${school.slug}/acudientes`,
    });
  });
}

/** Autorización de uso de imagen de los hijos (para que el acudiente la vea y la cambie). */
export function athleteConsents(database: Database, schoolId: string, athleteIds: string[]) {
  if (athleteIds.length === 0) return Promise.resolve([]);
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({ id: athletes.id, firstName: athletes.firstName, imageConsent: athletes.imageConsent })
      .from(athletes)
      .where(inArray(athletes.id, athleteIds)),
  );
}
