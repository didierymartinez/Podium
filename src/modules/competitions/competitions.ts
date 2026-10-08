import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  ageCategories,
  athleteDocuments,
  athleteGuardians,
  athletes,
  auditLogs,
  competitionEntries,
  competitionResults,
  competitions,
  documentTypes,
  enrollments,
  guardians,
  invoiceLines,
  invoices,
} from "@/db/schema";
import { decryptField } from "@/lib/crypto";
import type { IsoDate } from "@/lib/dates";
import { DOCUMENT_TYPE_LABELS } from "@/modules/athletes/schemas";
import { chargeAthleteLinesTx } from "@/modules/billing/invoices";
import type { BillingPolicy } from "@/modules/billing/policy";
import { familyUserIds, notifyUsers } from "@/modules/notifications/notify";
import { findAgeCategory, sportsAge } from "@/modules/schools/age-category";
import { COMPETITION_KINDS, MEDALS, MEDAL_LABELS, parseMedal, type Medal } from "./labels";

/** Competencias y participaciones (DEP-60 a DEP-68). */

type Ctx = { schoolId: string; actorUserId: string; slug: string };

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v ?? "");

export const competitionSchema = z
  .object({
    name: z.string().trim().min(3, "Escribe el nombre").max(120),
    kind: z.enum(COMPETITION_KINDS),
    startsOn: z.iso.date("Escribe la fecha de inicio"),
    endsOn: z.iso.date("Escribe la fecha de cierre"),
    city: text(80),
    venue: text(120),
    registrationDeadline: z.iso.date("Escribe la fecha límite de inscripción"),
    events: z.array(z.string().trim().min(1).max(60)).min(1, "Escribe al menos una prueba").max(40),
    entryFee: z.number().int().min(0).max(10_000_000),
    extras: z
      .array(
        z.object({ name: z.string().trim().min(2).max(60), amount: z.number().int().min(0).max(10_000_000) }),
      )
      .max(10),
    categoryIds: z.array(z.uuid()).max(30),
    requireNoDebt: z.boolean(),
    requiredDocumentTypeIds: z.array(z.uuid()).max(20),
    authorizationText: z.string().trim().min(20, "Escribe el texto de la autorización").max(2000),
    notes: z
      .string()
      .trim()
      .max(1000)
      .nullish()
      .transform((v) => v || null),
  })
  .refine((c) => c.endsOn >= c.startsOn, {
    message: "La fecha de cierre es anterior al inicio",
    path: ["endsOn"],
  })
  .refine((c) => c.registrationDeadline <= c.startsOn, {
    message: "La fecha límite debe ser antes de la competencia",
    path: ["registrationDeadline"],
  });

export function createCompetition(
  database: Database,
  ctx: Omit<Ctx, "slug">,
  raw: z.input<typeof competitionSchema>,
) {
  const input = competitionSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .insert(competitions)
      .values({ schoolId: ctx.schoolId, ...input, createdByUserId: ctx.actorUserId })
      .returning({ id: competitions.id });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "competition.created",
      entity: "competition",
      entityId: row.id,
      data: { name: input.name, startsOn: input.startsOn },
    });
    return row.id;
  });
}

/** Calendario: próximas primero, con el conteo de convocados por estado. */
export function listCompetitions(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const list = await tx.select().from(competitions).orderBy(desc(competitions.startsOn));
    const entries = list.length
      ? await tx
          .select({ competitionId: competitionEntries.competitionId, status: competitionEntries.status })
          .from(competitionEntries)
          .where(
            inArray(
              competitionEntries.competitionId,
              list.map((c) => c.id),
            ),
          )
      : [];
    return list.map((c) => {
      const own = entries.filter((e) => e.competitionId === c.id);
      return {
        ...c,
        invited: own.filter((e) => e.status === "INVITED").length,
        accepted: own.filter((e) => e.status === "ACCEPTED").length,
        declined: own.filter((e) => e.status === "DECLINED").length,
      };
    });
  });
}

export function getCompetition(database: Database, schoolId: string, competitionId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx.select().from(competitions).where(eq(competitions.id, competitionId));
    return row ?? null;
  });
}

// --- Convocatoria ---------------------------------------------------------------------------------

/** Validaciones (DEP-61): categoría, documentos requeridos vigentes a la fecha y mora. */
async function eligibilityTx(
  tx: Tx,
  competition: typeof competitions.$inferSelect,
  athleteIds: string[],
  today: IsoDate,
) {
  const issues = new Map<string, string[]>(athleteIds.map((id) => [id, []]));
  if (athleteIds.length === 0) return issues;
  const [people, categories, docs, types, overdue] = await Promise.all([
    tx
      .select({ id: athletes.id, birthDate: athletes.birthDate })
      .from(athletes)
      .where(inArray(athletes.id, athleteIds)),
    tx.select().from(ageCategories),
    competition.requiredDocumentTypeIds.length
      ? tx
          .select()
          .from(athleteDocuments)
          .where(
            and(
              inArray(athleteDocuments.athleteId, athleteIds),
              inArray(athleteDocuments.documentTypeId, competition.requiredDocumentTypeIds),
            ),
          )
      : [],
    competition.requiredDocumentTypeIds.length
      ? tx.select().from(documentTypes).where(inArray(documentTypes.id, competition.requiredDocumentTypeIds))
      : [],
    competition.requireNoDebt
      ? tx
          .selectDistinct({ athleteId: invoiceLines.athleteId })
          .from(invoiceLines)
          .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
          .where(
            and(
              inArray(invoiceLines.athleteId, athleteIds),
              inArray(invoices.status, ["PENDING", "PARTIAL"]),
              lt(invoices.dueOn, today),
            ),
          )
      : [],
  ]);
  const season = Number(competition.startsOn.slice(0, 4));
  for (const p of people) {
    const list = issues.get(p.id)!;
    if (competition.categoryIds.length) {
      const category = findAgeCategory(sportsAge(p.birthDate, season), categories);
      if (!category || !competition.categoryIds.includes(category.id))
        list.push(`Categoría ${category?.name ?? "sin categoría"} no admitida`);
    }
    for (const type of types) {
      const doc = docs.find((d) => d.athleteId === p.id && d.documentTypeId === type.id);
      if (!doc) list.push(`Falta ${type.name}`);
      else if (doc.expiresOn && doc.expiresOn < competition.startsOn) list.push(`${type.name} vencido`);
    }
    if (overdue.some((o) => o.athleteId === p.id)) list.push("En mora");
  }
  return issues;
}

/** Alumnos de un grupo con sus validaciones y si ya están convocados. */
export function candidates(
  database: Database,
  schoolId: string,
  competitionId: string,
  groupId: string,
  today: IsoDate,
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [competition] = await tx.select().from(competitions).where(eq(competitions.id, competitionId));
    if (!competition) return [];
    const list = await tx
      .selectDistinct({ id: athletes.id, firstName: athletes.firstName, lastName: athletes.lastName })
      .from(enrollments)
      .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
      .where(and(eq(enrollments.groupId, groupId), eq(enrollments.status, "ACTIVE")))
      .orderBy(asc(athletes.firstName), asc(athletes.lastName));
    const ids = list.map((a) => a.id);
    const [issues, existing] = await Promise.all([
      eligibilityTx(tx, competition, ids, today),
      ids.length
        ? tx
            .select({ athleteId: competitionEntries.athleteId })
            .from(competitionEntries)
            .where(
              and(
                eq(competitionEntries.competitionId, competitionId),
                inArray(competitionEntries.athleteId, ids),
              ),
            )
        : [],
    ]);
    return list.map((a) => ({
      ...a,
      issues: issues.get(a.id) ?? [],
      invited: existing.some((e) => e.athleteId === a.id),
    }));
  });
}

export const inviteSchema = z.object({
  athleteIds: z.array(z.uuid()).min(1, "Elige al menos un alumno").max(200),
  events: z.array(z.string().trim().min(1).max(60)).min(1, "Elige al menos una prueba").max(10),
  force: z.boolean(),
});

export type InviteResult =
  | { ok: true; invited: number; skipped: { name: string; issues: string[] }[] }
  | { ok: false; error: "not_found" | "closed" | "invalid_events" };

/** Convoca alumnos (DEP-61): sin `force` se omiten los que no cumplen; con `force` quedan con aviso. */
export function inviteAthletes(
  database: Database,
  ctx: Ctx,
  competitionId: string,
  raw: z.input<typeof inviteSchema>,
  today: IsoDate,
): Promise<InviteResult> {
  const input = inviteSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [competition] = await tx.select().from(competitions).where(eq(competitions.id, competitionId));
    if (!competition) return { ok: false, error: "not_found" };
    if (today > competition.registrationDeadline) return { ok: false, error: "closed" };
    if (input.events.some((e) => !competition.events.includes(e)))
      return { ok: false, error: "invalid_events" };
    const people = await tx
      .select({ id: athletes.id, firstName: athletes.firstName, lastName: athletes.lastName })
      .from(athletes)
      .where(inArray(athletes.id, input.athleteIds));
    const issues = await eligibilityTx(
      tx,
      competition,
      people.map((p) => p.id),
      today,
    );
    const skipped: { name: string; issues: string[] }[] = [];
    let invited = 0;
    for (const p of people) {
      const list = issues.get(p.id) ?? [];
      if (list.length && !input.force) {
        skipped.push({ name: `${p.firstName} ${p.lastName}`, issues: list });
        continue;
      }
      const inserted = await tx
        .insert(competitionEntries)
        .values({
          schoolId: ctx.schoolId,
          competitionId,
          athleteId: p.id,
          events: input.events,
          warnings: list,
          invitedByUserId: ctx.actorUserId,
        })
        .onConflictDoNothing()
        .returning({ id: competitionEntries.id });
      if (inserted.length === 0) continue;
      invited++;
      await notifyUsers(tx, ctx.schoolId, await familyUserIds(tx, [p.id]), {
        kind: "competition.invited",
        title: `${p.firstName} fue convocado(a): ${competition.name}`,
        body: `Responde antes del ${competition.registrationDeadline} en Mis hijos.`,
        href: `/${ctx.slug}/mis-hijos`,
        dedupeKey: `competition.invited:${inserted[0].id}`,
      });
    }
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "competition.invited",
      entity: "competition",
      entityId: competitionId,
      data: { invited, skipped: skipped.length, forced: input.force },
    });
    return { ok: true, invited, skipped };
  });
}

/** Retira a un convocado que aún no ha respondido. */
export function removeInvitation(database: Database, ctx: Omit<Ctx, "slug">, entryId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const deleted = await tx
      .delete(competitionEntries)
      .where(and(eq(competitionEntries.id, entryId), eq(competitionEntries.status, "INVITED")))
      .returning();
    return deleted.length > 0;
  });
}

// --- Familias -------------------------------------------------------------------------------------

/** Convocatorias de los hijos (va dentro de `asPortalUser`: RLS solo deja ver las suyas). */
export function familyInvitations(database: Database, schoolId: string, today: IsoDate) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({ entry: competitionEntries, competition: competitions, firstName: athletes.firstName })
      .from(competitionEntries)
      .innerJoin(competitions, eq(competitions.id, competitionEntries.competitionId))
      .innerJoin(athletes, eq(athletes.id, competitionEntries.athleteId))
      .orderBy(asc(competitions.startsOn));
    return rows.filter((r) => r.competition.endsOn >= today);
  });
}

export const responseSchema = z.object({
  accept: z.boolean(),
  extras: z.array(z.string().trim().max(60)).max(10),
  authorized: z.boolean(),
});

export type RespondResult =
  | { ok: true; entryId: string; accepted: boolean }
  | { ok: false; error: "not_found" | "closed" | "not_authorized" };

/**
 * La familia acepta (con autorización digital: fecha, IP y texto aceptado, DEP-62) o rechaza.
 * Va dentro de `asPortalUser`; el cobro se genera después con `chargeEntry`.
 */
export function respondToInvitation(
  database: Database,
  schoolId: string,
  userId: string,
  entryId: string,
  raw: z.input<typeof responseSchema>,
  meta: { ip: string | null; now: Date; today: IsoDate },
): Promise<RespondResult> {
  const input = responseSchema.parse(raw);
  return runInTenant(database, { schoolId }, async (tx) => {
    const [row] = await tx
      .select({ entry: competitionEntries, competition: competitions })
      .from(competitionEntries)
      .innerJoin(competitions, eq(competitions.id, competitionEntries.competitionId))
      .where(eq(competitionEntries.id, entryId));
    if (!row || row.entry.status !== "INVITED") return { ok: false, error: "not_found" };
    if (meta.today > row.competition.registrationDeadline) return { ok: false, error: "closed" };
    if (input.accept && !input.authorized) return { ok: false, error: "not_authorized" };
    const extras = input.accept
      ? input.extras.filter((e) => row.competition.extras.some((x) => x.name === e))
      : [];
    await tx
      .update(competitionEntries)
      .set({
        status: input.accept ? "ACCEPTED" : "DECLINED",
        extras,
        respondedAt: meta.now,
        respondedByUserId: userId,
        authorizationText: input.accept ? row.competition.authorizationText : null,
        authorizationIp: input.accept ? meta.ip : null,
      })
      .where(eq(competitionEntries.id, entryId));
    return { ok: true, entryId, accepted: input.accept };
  });
}

/** Cobro al aceptar (DEP-63): inscripción + adicionales elegidos, al responsable de pago. */
export function chargeEntry(
  database: Database,
  ctx: Ctx,
  entryId: string,
  today: IsoDate,
  policy: BillingPolicy,
) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .select({
        entry: competitionEntries,
        competition: competitions,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
      })
      .from(competitionEntries)
      .innerJoin(competitions, eq(competitions.id, competitionEntries.competitionId))
      .innerJoin(athletes, eq(athletes.id, competitionEntries.athleteId))
      .where(eq(competitionEntries.id, entryId));
    if (!row) return null;
    const name = `${row.firstName} ${row.lastName}`;
    if (row.entry.invitedByUserId)
      await notifyUsers(tx, ctx.schoolId, [row.entry.invitedByUserId], {
        kind: "competition.responded",
        title: `${name} ${row.entry.status === "ACCEPTED" ? "confirmó" : "no asistirá a"} ${row.competition.name}`,
        body:
          row.entry.status === "ACCEPTED"
            ? "La familia aceptó y firmó la autorización."
            : "La familia rechazó la convocatoria.",
        href: `/${ctx.slug}/competencias/${row.competition.id}`,
        dedupeKey: `competition.responded:${entryId}`,
      });
    if (row.entry.status !== "ACCEPTED" || row.entry.invoiceId) return null;
    const lines = [
      { description: `Inscripción ${row.competition.name}`, amount: row.competition.entryFee },
      ...row.competition.extras
        .filter((x) => row.entry.extras.includes(x.name))
        .map((x) => ({ description: `${x.name} · ${row.competition.name}`, amount: x.amount })),
    ];
    const invoiceId = await chargeAthleteLinesTx(
      tx,
      ctx,
      { id: row.entry.athleteId, firstName: row.firstName },
      {
        title: `Inscripción a ${row.competition.name}`,
        lines,
        dueOn: row.competition.registrationDeadline,
        today,
      },
      policy,
    );
    if (invoiceId)
      await tx.update(competitionEntries).set({ invoiceId }).where(eq(competitionEntries.id, entryId));
    return invoiceId;
  });
}

// --- Inscritos, viaje y resultados ----------------------------------------------------------------

/** Convocados con su estado y resultados. */
export function competitionEntriesList(database: Database, schoolId: string, competitionId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({ entry: competitionEntries, firstName: athletes.firstName, lastName: athletes.lastName })
      .from(competitionEntries)
      .innerJoin(athletes, eq(athletes.id, competitionEntries.athleteId))
      .where(eq(competitionEntries.competitionId, competitionId))
      .orderBy(asc(athletes.firstName), asc(athletes.lastName));
    const results = rows.length
      ? await tx
          .select()
          .from(competitionResults)
          .where(
            inArray(
              competitionResults.entryId,
              rows.map((r) => r.entry.id),
            ),
          )
      : [];
    return rows.map((r) => ({
      ...r.entry,
      name: `${r.firstName} ${r.lastName}`,
      results: results.filter((x) => x.entryId === r.entry.id),
    }));
  });
}

async function acceptedAthletes(tx: Tx, competitionId: string) {
  return tx
    .select({ entry: competitionEntries, athlete: athletes })
    .from(competitionEntries)
    .innerJoin(athletes, eq(athletes.id, competitionEntries.athleteId))
    .where(
      and(eq(competitionEntries.competitionId, competitionId), eq(competitionEntries.status, "ACCEPTED")),
    )
    .orderBy(asc(athletes.firstName), asc(athletes.lastName));
}

/** Inscritos para la liga (DEP-64): documento, nacimiento, categoría y pruebas. */
export function registrationSheet(database: Database, schoolId: string, competitionId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [competition] = await tx.select().from(competitions).where(eq(competitions.id, competitionId));
    if (!competition) return null;
    const [rows, categories] = await Promise.all([
      acceptedAthletes(tx, competitionId),
      tx.select().from(ageCategories),
    ]);
    const season = Number(competition.startsOn.slice(0, 4));
    return {
      competition,
      rows: rows.map(({ entry, athlete: a }) => ({
        name: `${a.firstName} ${a.lastName}`,
        documentType: a.documentType ? DOCUMENT_TYPE_LABELS[a.documentType] : "",
        documentNumber: a.documentNumber ?? "",
        birthDate: a.birthDate,
        sex: a.sex ?? "",
        category: findAgeCategory(sportsAge(a.birthDate, season), categories)?.name ?? "",
        events: entry.events.join(", "),
      })),
    };
  });
}

/** Lista de viaje (DEP-65): contactos de emergencia, acudientes y datos médicos (solo administración). */
export function travelList(database: Database, schoolId: string, competitionId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [competition] = await tx.select().from(competitions).where(eq(competitions.id, competitionId));
    if (!competition) return null;
    const rows = await acceptedAthletes(tx, competitionId);
    const family = rows.length
      ? await tx
          .select({
            athleteId: athleteGuardians.athleteId,
            firstName: guardians.firstName,
            lastName: guardians.lastName,
            phone: guardians.phone,
          })
          .from(athleteGuardians)
          .innerJoin(guardians, eq(guardians.id, athleteGuardians.guardianId))
          .where(
            inArray(
              athleteGuardians.athleteId,
              rows.map((r) => r.athlete.id),
            ),
          )
      : [];
    return {
      competition,
      rows: rows.map(({ entry, athlete: a }) => ({
        name: `${a.firstName} ${a.lastName}`,
        document: [a.documentType ? DOCUMENT_TYPE_LABELS[a.documentType] : "", a.documentNumber ?? ""]
          .join(" ")
          .trim(),
        birthDate: a.birthDate,
        bloodType: a.bloodType ?? "",
        healthInsurer: a.healthInsurer ?? "",
        medicalNotes: decryptField(a.medicalNotesEncrypted) ?? "",
        emergency: [a.emergencyContactName, a.emergencyContactPhone].filter(Boolean).join(" · "),
        guardians: family
          .filter((g) => g.athleteId === a.id)
          .map((g) => `${g.firstName} ${g.lastName} ${g.phone ?? ""}`.trim())
          .join(" / "),
        extras: entry.extras.join(", "),
      })),
    };
  });
}

export const resultSchema = z.object({
  event: z.string().trim().min(1).max(60),
  position: z.number().int().min(1).max(999).nullable(),
  mark: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v || null),
  medal: z.enum(MEDALS).nullable(),
  notes: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => v || null),
});

async function saveResultTx(
  tx: Tx,
  ctx: Ctx,
  entry: { id: string; athleteId: string },
  competitionName: string,
  input: z.output<typeof resultSchema>,
) {
  const values = { position: input.position, mark: input.mark, medal: input.medal, notes: input.notes };
  const [previous] = await tx
    .select({ medal: competitionResults.medal })
    .from(competitionResults)
    .where(and(eq(competitionResults.entryId, entry.id), eq(competitionResults.event, input.event)));
  await tx
    .insert(competitionResults)
    .values({
      schoolId: ctx.schoolId,
      entryId: entry.id,
      event: input.event,
      ...values,
      createdByUserId: ctx.actorUserId,
    })
    .onConflictDoUpdate({ target: [competitionResults.entryId, competitionResults.event], set: values });
  if (input.medal && previous?.medal !== input.medal) {
    const [athlete] = await tx
      .select({ firstName: athletes.firstName })
      .from(athletes)
      .where(eq(athletes.id, entry.athleteId));
    await notifyUsers(tx, ctx.schoolId, await familyUserIds(tx, [entry.athleteId]), {
      kind: "competition.medal",
      title: `¡${athlete.firstName} ganó ${MEDAL_LABELS[input.medal].toLowerCase()}!`,
      body: `${input.event} · ${competitionName}`,
      href: `/${ctx.slug}/mis-hijos`,
      dedupeKey: `competition.medal:${entry.id}:${input.event}:${input.medal}`,
    });
  }
}

/** Registra o corrige el resultado de un inscrito en una prueba (DEP-66). */
export function saveResult(database: Database, ctx: Ctx, entryId: string, raw: z.input<typeof resultSchema>) {
  const input = resultSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .select({ entry: competitionEntries, name: competitions.name })
      .from(competitionEntries)
      .innerJoin(competitions, eq(competitions.id, competitionEntries.competitionId))
      .where(eq(competitionEntries.id, entryId));
    if (!row || row.entry.status !== "ACCEPTED") return null;
    await saveResultTx(tx, ctx, row.entry, row.name, input);
    return row.entry.athleteId;
  });
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const RESULT_COLUMNS = [
  "Documento",
  "Nombre",
  "Prueba",
  "Posición",
  "Marca",
  "Medalla",
  "Observación",
];

/**
 * Importa resultados desde Excel (DEP-66): una fila por alumno y prueba. Se busca al inscrito por
 * documento o, si no hay, por nombre completo.
 */
export function importResults(database: Database, ctx: Ctx, competitionId: string, rows: string[][]) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [competition] = await tx.select().from(competitions).where(eq(competitions.id, competitionId));
    if (!competition) return null;
    const accepted = await acceptedAthletes(tx, competitionId);
    const header = (rows[0] ?? []).map(normalize);
    const col = (name: string) => header.indexOf(normalize(name));
    const idx = Object.fromEntries(RESULT_COLUMNS.map((c) => [c, col(c)]));
    let saved = 0;
    const unmatched: string[] = [];
    const athleteIds = new Set<string>();
    for (const [i, row] of rows.slice(1).entries()) {
      const cell = (name: string) => (idx[name] >= 0 ? (row[idx[name]] ?? "").trim() : "");
      if (!row.some((c) => c?.trim())) continue;
      const doc = cell("Documento").replace(/\D/g, "");
      const name = normalize(cell("Nombre"));
      const match = accepted.find(
        ({ athlete: a }) =>
          (doc && a.documentNumber?.replace(/\D/g, "") === doc) ||
          (!doc && name && normalize(`${a.firstName} ${a.lastName}`) === name),
      );
      const parsed = resultSchema.safeParse({
        event: cell("Prueba"),
        position: cell("Posición") ? Number(cell("Posición")) : null,
        mark: cell("Marca"),
        medal: parseMedal(cell("Medalla")),
        notes: cell("Observación"),
      });
      if (!match || !parsed.success) {
        unmatched.push(`Fila ${i + 2}: ${cell("Nombre") || cell("Documento") || "sin nombre"}`);
        continue;
      }
      await saveResultTx(tx, ctx, match.entry, competition.name, parsed.data);
      athleteIds.add(match.entry.athleteId);
      saved++;
    }
    return { saved, unmatched, athleteIds: [...athleteIds] };
  });
}

// --- Medallero e historial ------------------------------------------------------------------------

export type MedalCount = Record<Medal, number>;
const emptyCount = (): MedalCount => ({ GOLD: 0, SILVER: 0, BRONZE: 0 });

/** Medallero (DEP-67) de una temporada: total, por competencia y por categoría. */
export function medalTable(database: Database, schoolId: string, season: number) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [rows, categories] = await Promise.all([
      tx
        .select({
          medal: competitionResults.medal,
          competitionId: competitions.id,
          competitionName: competitions.name,
          startsOn: competitions.startsOn,
          birthDate: athletes.birthDate,
        })
        .from(competitionResults)
        .innerJoin(competitionEntries, eq(competitionEntries.id, competitionResults.entryId))
        .innerJoin(competitions, eq(competitions.id, competitionEntries.competitionId))
        .innerJoin(athletes, eq(athletes.id, competitionEntries.athleteId)),
      tx.select().from(ageCategories),
    ]);
    const total = emptyCount();
    const byCompetition = new Map<string, { name: string; startsOn: string; medals: MedalCount }>();
    const byCategory = new Map<string, MedalCount>();
    for (const r of rows) {
      if (!r.medal || Number(r.startsOn.slice(0, 4)) !== season) continue;
      total[r.medal]++;
      const c = byCompetition.get(r.competitionId) ?? {
        name: r.competitionName,
        startsOn: r.startsOn,
        medals: emptyCount(),
      };
      c.medals[r.medal]++;
      byCompetition.set(r.competitionId, c);
      const category = findAgeCategory(sportsAge(r.birthDate, season), categories)?.name ?? "Sin categoría";
      const k = byCategory.get(category) ?? emptyCount();
      k[r.medal]++;
      byCategory.set(category, k);
    }
    return {
      total,
      competitions: [...byCompetition.values()].sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
      categories: [...byCategory.entries()].map(([name, medals]) => ({ name, medals })),
    };
  });
}

/** Historial competitivo del alumno (DEP-68); en el portal va dentro de `asPortalUser`. */
export function athleteCompetitions(database: Database, schoolId: string, athleteId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const rows = await tx
      .select({ entry: competitionEntries, competition: competitions })
      .from(competitionEntries)
      .innerJoin(competitions, eq(competitions.id, competitionEntries.competitionId))
      .where(and(eq(competitionEntries.athleteId, athleteId), eq(competitionEntries.status, "ACCEPTED")))
      .orderBy(desc(competitions.startsOn));
    const results = rows.length
      ? await tx
          .select()
          .from(competitionResults)
          .where(
            inArray(
              competitionResults.entryId,
              rows.map((r) => r.entry.id),
            ),
          )
      : [];
    return rows.map((r) => ({
      id: r.competition.id,
      name: r.competition.name,
      startsOn: r.competition.startsOn,
      city: r.competition.city,
      results: results
        .filter((x) => x.entryId === r.entry.id)
        .map((x) => ({ id: x.id, event: x.event, position: x.position, mark: x.mark, medal: x.medal })),
    }));
  });
}
