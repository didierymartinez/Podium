import { and, asc, count, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import {
  athleteDocuments,
  athletes,
  attendance,
  auditLogs,
  coaches,
  documentTypes,
  enrollments,
  groupCoaches,
  groups,
  sessionAthletes,
  sessions,
} from "@/db/schema";
import { instantOf, type IsoDate } from "@/lib/dates";
import { documentStatus } from "@/modules/documents/status";
import { hhmm } from "@/modules/groups/schedule";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "./labels";
import { attendanceRate, canRecordAttendance, type AttendanceCounts } from "./planning";

export { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, type AttendanceStatus } from "./labels";

export type RosterEntry = {
  athleteId: string;
  firstName: string;
  lastName: string;
  photoFileId: string | null;
  birthday: boolean;
  trial: boolean;
  /** Tiene nota médica (el contenido solo lo ve quien puede ver datos de salud). */
  medicalNote: boolean;
  /** Documento obligatorio vencido o pendiente. */
  documentIssue: "expired" | "missing" | null;
  status: AttendanceStatus | null;
  excuseReason: string | null;
};

export type SessionDetail = {
  id: string;
  date: IsoDate;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "CANCELED";
  source: "SCHEDULE" | "EXTRA";
  cancelReason: string | null;
  note: string | null;
  group: { id: string; name: string; color: string };
  coachNames: string[];
  substitute: { id: string; name: string } | null;
  rescheduledTo: { id: string; date: IsoDate; startTime: string } | null;
  rescheduledFrom: { id: string; date: IsoDate; startTime: string } | null;
  /** Clase extra con alumnos citados (no todo el grupo). */
  selectedAthletes: boolean;
  isGroupCoach: boolean;
  roster: RosterEntry[];
};

type SessionRow = typeof sessions.$inferSelect;

/** Profesor del grupo (titular o auxiliar) o sustituto asignado a esta clase. */
export async function isSessionCoach(
  tx: Tx,
  session: Pick<SessionRow, "groupId" | "substituteCoachId">,
  userId: string,
) {
  const [row] = await tx
    .select({ id: coaches.id })
    .from(coaches)
    .leftJoin(
      groupCoaches,
      and(eq(groupCoaches.coachId, coaches.id), eq(groupCoaches.groupId, session.groupId)),
    )
    .where(
      and(
        eq(coaches.userId, userId),
        eq(coaches.active, true),
        session.substituteCoachId
          ? or(sql`${groupCoaches.id} is not null`, eq(coaches.id, session.substituteCoachId))
          : sql`${groupCoaches.id} is not null`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Lista de la clase. Normal: matriculados en el grupo en esa fecha (activos, preinscritos y retirados
 * después de la clase). Clase extra con alumnos citados: solo ellos. Siempre suma a quien ya tenga
 * registro. Los congelados no aparecen salvo que tengan registro.
 */
export async function loadRoster(
  tx: Tx,
  session: Pick<SessionRow, "id" | "groupId" | "date">,
): Promise<RosterEntry[]> {
  const columns = {
    athleteId: athletes.id,
    firstName: athletes.firstName,
    lastName: athletes.lastName,
    birthDate: athletes.birthDate,
    photoFileId: athletes.photoFileId,
    medical: sql<boolean>`${athletes.medicalNotesEncrypted} is not null`,
  };
  const selected = await tx
    .select(columns)
    .from(sessionAthletes)
    .innerJoin(athletes, eq(athletes.id, sessionAthletes.athleteId))
    .where(eq(sessionAthletes.sessionId, session.id));
  const [enrolled, records] = await Promise.all([
    selected.length > 0
      ? Promise.resolve(selected.map((a) => ({ ...a, status: "ACTIVE" as const })))
      : tx
          .select({ ...columns, status: enrollments.status })
          .from(enrollments)
          .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
          .where(
            and(
              eq(enrollments.groupId, session.groupId),
              inArray(enrollments.status, ["ACTIVE", "PRE_ENROLLED", "WITHDRAWN"]),
              lte(enrollments.startDate, session.date),
              or(isNull(enrollments.endDate), gte(enrollments.endDate, session.date)),
            ),
          ),
    tx
      .select({ ...columns, status: attendance.status, excuseReason: attendance.excuseReason })
      .from(attendance)
      .innerJoin(athletes, eq(athletes.id, attendance.athleteId))
      .where(eq(attendance.sessionId, session.id)),
  ]);

  const byId = new Map<string, RosterEntry>();
  const monthDay = session.date.slice(5);
  const base = (a: (typeof enrolled)[number] | (typeof records)[number]) => ({
    athleteId: a.athleteId,
    firstName: a.firstName,
    lastName: a.lastName,
    photoFileId: a.photoFileId,
    birthday: a.birthDate.slice(5) === monthDay,
    medicalNote: Boolean(a.medical),
    documentIssue: null,
    trial: false,
    status: null,
    excuseReason: null,
  });
  for (const e of enrolled) {
    const prev = byId.get(e.athleteId);
    byId.set(e.athleteId, { ...base(e), trial: Boolean(prev?.trial) || e.status === "PRE_ENROLLED" });
  }
  for (const r of records) {
    byId.set(r.athleteId, {
      ...(byId.get(r.athleteId) ?? base(r)),
      status: r.status,
      excuseReason: r.excuseReason,
    });
  }

  const ids = [...byId.keys()];
  if (ids.length > 0) {
    const [types, docs] = await Promise.all([
      tx
        .select({ id: documentTypes.id })
        .from(documentTypes)
        .where(and(eq(documentTypes.active, true), eq(documentTypes.required, true))),
      tx
        .select({
          athleteId: athleteDocuments.athleteId,
          typeId: athleteDocuments.documentTypeId,
          expiresOn: athleteDocuments.expiresOn,
        })
        .from(athleteDocuments)
        .where(inArray(athleteDocuments.athleteId, ids)),
    ]);
    for (const entry of byId.values()) {
      const states = types.map((t) =>
        documentStatus(
          docs.find((d) => d.athleteId === entry.athleteId && d.typeId === t.id),
          true,
          session.date,
        ),
      );
      entry.documentIssue = states.includes("expired")
        ? "expired"
        : states.includes("missing")
          ? "missing"
          : null;
    }
  }
  return [...byId.values()].sort(
    (a, b) => a.firstName.localeCompare(b.firstName, "es") || a.lastName.localeCompare(b.lastName, "es"),
  );
}

export function getSessionDetail(
  database: Database,
  ctx: { schoolId: string; userId: string },
  sessionId: string,
): Promise<SessionDetail | null> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx
      .select({ session: sessions, group: { id: groups.id, name: groups.name, color: groups.color } })
      .from(sessions)
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .where(eq(sessions.id, sessionId));
    if (!row) return null;
    const { session, group } = row;
    const [coachRows, isGroupCoach, roster, substitute, linked, selected] = await Promise.all([
      tx
        .select({ firstName: coaches.firstName, lastName: coaches.lastName })
        .from(groupCoaches)
        .innerJoin(coaches, eq(coaches.id, groupCoaches.coachId))
        .where(eq(groupCoaches.groupId, group.id))
        .orderBy(asc(groupCoaches.role)),
      isSessionCoach(tx, session, ctx.userId),
      loadRoster(tx, session),
      session.substituteCoachId
        ? tx
            .select({ id: coaches.id, firstName: coaches.firstName, lastName: coaches.lastName })
            .from(coaches)
            .where(eq(coaches.id, session.substituteCoachId))
        : Promise.resolve([]),
      tx
        .select({
          id: sessions.id,
          date: sessions.date,
          startTime: sessions.startTime,
          rescheduledToId: sessions.rescheduledToId,
        })
        .from(sessions)
        .where(
          or(
            eq(sessions.rescheduledToId, session.id),
            session.rescheduledToId ? eq(sessions.id, session.rescheduledToId) : sql`false`,
          ),
        ),
      tx
        .select({ id: sessionAthletes.id })
        .from(sessionAthletes)
        .where(eq(sessionAthletes.sessionId, session.id))
        .limit(1),
    ]);
    const short = (s: { id: string; date: string; startTime: string } | undefined) =>
      s ? { id: s.id, date: s.date, startTime: hhmm(s.startTime) } : null;
    return {
      id: session.id,
      date: session.date,
      startTime: hhmm(session.startTime),
      endTime: hhmm(session.endTime),
      status: session.status,
      source: session.source,
      cancelReason: session.cancelReason,
      note: session.note,
      group,
      coachNames: coachRows.map((c) => `${c.firstName} ${c.lastName}`),
      substitute: substitute[0]
        ? { id: substitute[0].id, name: `${substitute[0].firstName} ${substitute[0].lastName}` }
        : null,
      rescheduledTo: short(linked.find((l) => l.id === session.rescheduledToId)),
      rescheduledFrom: short(linked.find((l) => l.rescheduledToId === session.id)),
      selectedAthletes: selected.length > 0,
      isGroupCoach,
      roster,
    };
  });
}

export const attendanceSchema = z.object({
  entries: z
    .array(
      z
        .object({
          athleteId: z.uuid(),
          status: z.enum(ATTENDANCE_STATUSES),
          excuseReason: z.string().trim().max(120).nullish(),
        })
        .transform((e) => ({
          athleteId: e.athleteId,
          status: e.status,
          excuseReason: e.status === "EXCUSED" && e.excuseReason ? e.excuseReason : null,
        })),
    )
    .min(1, "Marca la asistencia de al menos un alumno")
    .max(500),
  /** Momento en que se marcó en el celular (sin conexión puede llegar horas después). */
  recordedAt: z.coerce.date().optional(),
});

/** Hasta cuánto tiempo atrás se acepta una marca guardada sin conexión. */
export const OFFLINE_MAX_AGE_HOURS = 24 * 7;

export type AttendanceInput = z.input<typeof attendanceSchema>;

export type SaveAttendanceResult =
  | { ok: true; saved: number }
  | {
      ok: false;
      error:
        "not_found" | "canceled" | "not_coach" | "too_early" | "window_closed" | "not_in_roster" | "stale";
    };

/**
 * Guarda (o corrige) la asistencia de una clase. Administración siempre;
 * el profesor del grupo desde 1 h antes y hasta 48 h después de terminar.
 *
 * Sin conexión (DEP-21): `recordedAt` es la hora en que se marcó en el celular. Los permisos se
 * evalúan con esa hora y, ante dos registros del mismo alumno, gana el último marcado; el más viejo
 * se descarta y queda auditado.
 */
export function saveAttendance(
  database: Database,
  ctx: { schoolId: string; actorUserId: string; timeZone: string; isManager: boolean },
  sessionId: string,
  raw: AttendanceInput,
  now: Date = new Date(),
): Promise<SaveAttendanceResult> {
  const input = attendanceSchema.parse(raw);
  const offline = input.recordedAt !== undefined;
  const recordedAt = input.recordedAt ?? now;
  if (recordedAt.getTime() > now.getTime() + 5 * 60_000)
    return Promise.resolve({ ok: false, error: "stale" });
  if (now.getTime() - recordedAt.getTime() > OFFLINE_MAX_AGE_HOURS * 3_600_000) {
    return Promise.resolve({ ok: false, error: "stale" });
  }
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx): Promise<SaveAttendanceResult> => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return { ok: false, error: "not_found" };
    if (session.status === "CANCELED") return { ok: false, error: "canceled" };

    const permission = canRecordAttendance({
      isManager: ctx.isManager,
      isGroupCoach: ctx.isManager ? false : await isSessionCoach(tx, session, ctx.actorUserId),
      sessionStart: instantOf(session.date, session.startTime, ctx.timeZone),
      sessionEnd: instantOf(session.date, session.endTime, ctx.timeZone),
      now: recordedAt,
    });
    if (!permission.allowed) return { ok: false, error: permission.reason ?? "not_coach" };

    const roster = new Set((await loadRoster(tx, session)).map((r) => r.athleteId));
    if (input.entries.some((e) => !roster.has(e.athleteId))) return { ok: false, error: "not_in_roster" };

    const written = await tx
      .insert(attendance)
      .values(
        input.entries.map((e) => ({
          schoolId: ctx.schoolId,
          sessionId,
          athleteId: e.athleteId,
          status: e.status,
          excuseReason: e.excuseReason,
          recordedByUserId: ctx.actorUserId,
          createdAt: recordedAt,
          updatedAt: recordedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [attendance.sessionId, attendance.athleteId],
        set: {
          status: sql`excluded.status`,
          excuseReason: sql`excluded.excuse_reason`,
          recordedByUserId: sql`excluded.recorded_by_user_id`,
          updatedAt: sql`excluded.updated_at`,
        },
        // Gana el último registro marcado (un envío atrasado no pisa una corrección posterior).
        setWhere: sql`${attendance.updatedAt} <= excluded.updated_at`,
      })
      .returning({ athleteId: attendance.athleteId });
    const applied = new Set(written.map((w) => w.athleteId));
    const discarded = input.entries.filter((e) => !applied.has(e.athleteId)).map((e) => e.athleteId);

    const totals = Object.fromEntries(
      ATTENDANCE_STATUSES.map((s) => [s, input.entries.filter((e) => e.status === s).length]),
    );
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "attendance.recorded",
      entity: "session",
      entityId: sessionId,
      data: {
        date: session.date,
        groupId: session.groupId,
        totals,
        ...(offline ? { offline: true, recordedAt: recordedAt.toISOString() } : {}),
        ...(discarded.length ? { discardedOlder: discarded } : {}),
      },
    });
    return { ok: true, saved: applied.size };
  });
}

export type AthleteAttendance = AttendanceCounts & { rate: number | null; sessions: number };

/**
 * Asistencia por alumno entre dos fechas (solo clases no canceladas).
 * % = (presente + tarde) ÷ (registros − excusas), ver `attendanceRate`.
 */
export function attendanceStats(
  database: Database,
  schoolId: string,
  athleteIds: string[],
  range: { from: IsoDate; to: IsoDate },
): Promise<Map<string, AthleteAttendance>> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const result = new Map<string, AthleteAttendance>();
    if (athleteIds.length === 0) return result;
    const rows = await tx
      .select({ athleteId: attendance.athleteId, status: attendance.status, total: count() })
      .from(attendance)
      .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
      .where(
        and(
          inArray(attendance.athleteId, athleteIds),
          eq(sessions.status, "SCHEDULED"),
          gte(sessions.date, range.from),
          lte(sessions.date, range.to),
        ),
      )
      .groupBy(attendance.athleteId, attendance.status);
    for (const id of athleteIds) {
      const of = (s: AttendanceStatus) => rows.find((r) => r.athleteId === id && r.status === s)?.total ?? 0;
      const counts = {
        present: of("PRESENT"),
        late: of("LATE"),
        absent: of("ABSENT"),
        excused: of("EXCUSED"),
      };
      const sessionsCount = counts.present + counts.late + counts.absent + counts.excused;
      result.set(id, { ...counts, sessions: sessionsCount, rate: attendanceRate(counts) });
    }
    return result;
  });
}

/** Últimos registros de asistencia de un alumno (portal de familias). */
export function attendanceHistory(database: Database, schoolId: string, athleteId: string, limit = 10) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        date: sessions.date,
        startTime: sessions.startTime,
        groupName: groups.name,
        status: attendance.status,
        excuseReason: attendance.excuseReason,
      })
      .from(attendance)
      .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .where(eq(attendance.athleteId, athleteId))
      .orderBy(sql`${sessions.date} desc`, sql`${sessions.startTime} desc`)
      .limit(limit),
  );
}
