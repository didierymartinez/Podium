import { and, asc, between, eq, inArray, sql } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import {
  ageCategories,
  athleteGuardians,
  athletes,
  attendance,
  coaches,
  enrollments,
  groupCoaches,
  groups,
  guardians,
  levels,
  payments,
  sessions,
} from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { displayPhone } from "@/lib/phone";
import type { Sheet } from "@/lib/xlsx";
import { ENROLLMENT_STATUS_LABELS, WITHDRAWAL_REASON_LABELS } from "@/modules/athletes/enrollment-status";
import { attendanceRate } from "@/modules/attendance/planning";
import { METHOD_LABELS } from "@/modules/billing/labels";
import { agingReport } from "@/modules/billing/statement";
import { billedVsCollected, ratio } from "@/modules/dashboard/metrics";
import { findAgeCategory, sportsAge } from "@/modules/schools/age-category";

/** Reportes exportables (§12.2 de docs/GESTION_ADMINISTRATIVA.md). */

export type ColumnKind = "text" | "money" | "number" | "percent" | "date";
export type ReportColumn = { key: string; label: string; kind?: ColumnKind };
export type ReportValue = string | number | null;
export type ReportTable = {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, ReportValue>[];
  /** Fila de totales (mismas llaves que las columnas). */
  totals?: Record<string, ReportValue>;
};

export const REPORTS = {
  "facturado-vs-recaudado": {
    title: "Facturado vs. recaudado",
    description: "Últimos 12 meses",
    usesRange: false,
  },
  cartera: { title: "Cartera por edades", description: "Deudores y saldo por antigüedad", usesRange: false },
  pagos: { title: "Pagos por medio y fecha", description: "Conciliación de caja y bancos", usesRange: true },
  alumnos: {
    title: "Alumnos activos",
    description: "Por grupo, nivel y categoría",
    usesRange: false,
  },
  "altas-y-retiros": {
    title: "Altas, retiros y motivos",
    description: "Movimientos de matrícula en el periodo",
    usesRange: true,
  },
  "asistencia-grupos": {
    title: "Asistencia por grupo",
    description: "Clases y % de asistencia",
    usesRange: true,
  },
  "asistencia-profesores": {
    title: "Asistencia por profesor",
    description: "Clases a cargo y registro",
    usesRange: true,
  },
  "asistencia-alumnos": {
    title: "Asistencia por alumno",
    description: "Presentes, ausencias y %",
    usesRange: true,
  },
} as const;

export type ReportId = keyof typeof REPORTS;
export const isReportId = (id: string): id is ReportId => id in REPORTS;

export type Range = { from: IsoDate; to: IsoDate };

const sum = (rows: Record<string, ReportValue>[], key: string) =>
  rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);

export async function buildReport(
  database: Database,
  schoolId: string,
  id: ReportId,
  range: Range,
  today: IsoDate,
): Promise<ReportTable> {
  const title = REPORTS[id].title;
  switch (id) {
    case "facturado-vs-recaudado": {
      const trend = await billedVsCollected(database, schoolId, today, 12);
      const rows = trend.map((p) => ({
        period: p.period,
        billed: p.billed,
        collected: p.collected,
        rate: ratio(p.collected, p.billed),
      }));
      return {
        title,
        columns: [
          { key: "period", label: "Mes" },
          { key: "billed", label: "Facturado", kind: "money" },
          { key: "collected", label: "Recaudado", kind: "money" },
          { key: "rate", label: "Recaudado / facturado", kind: "percent" },
        ],
        rows,
        totals: {
          period: "Total",
          billed: sum(rows, "billed"),
          collected: sum(rows, "collected"),
          rate: ratio(sum(rows, "collected"), sum(rows, "billed")),
        },
      };
    }
    case "cartera": {
      const report = await agingReport(database, schoolId, today);
      const rows = report.debtors.map((d) => ({
        name: d.name,
        phone: displayPhone(d.phone),
        athletes: d.athletes.join(", "),
        current: d.buckets.current,
        d1_30: d.buckets.d1_30,
        d31_60: d.buckets.d31_60,
        d61_90: d.buckets.d61_90,
        d90: d.buckets.d90,
        total: d.total,
      }));
      return {
        title,
        columns: [
          { key: "name", label: "Responsable de pago" },
          { key: "phone", label: "Celular" },
          { key: "athletes", label: "Alumnos" },
          { key: "current", label: "Al día", kind: "money" },
          { key: "d1_30", label: "1–30 días", kind: "money" },
          { key: "d31_60", label: "31–60 días", kind: "money" },
          { key: "d61_90", label: "61–90 días", kind: "money" },
          { key: "d90", label: "Más de 90", kind: "money" },
          { key: "total", label: "Total", kind: "money" },
        ],
        rows,
        totals: {
          name: "Total",
          ...report.totals,
          total: report.total,
        },
      };
    }
    case "pagos": {
      const rows = await runInTenant(database, { schoolId }, (tx) =>
        tx
          .select({
            paidOn: payments.paidOn,
            code: payments.code,
            guardian: sql<string>`${guardians.firstName} || ' ' || ${guardians.lastName}`,
            method: payments.method,
            reference: payments.reference,
            amount: payments.amount,
          })
          .from(payments)
          .innerJoin(guardians, eq(guardians.id, payments.guardianId))
          .where(and(eq(payments.status, "CONFIRMED"), between(payments.paidOn, range.from, range.to)))
          .orderBy(asc(payments.paidOn), asc(payments.number)),
      );
      const byMethod = Object.entries(METHOD_LABELS)
        .map(([k, label]) => ({
          label,
          total: rows.filter((r) => r.method === k).reduce((s, r) => s + r.amount, 0),
        }))
        .filter((m) => m.total > 0);
      return {
        title,
        columns: [
          { key: "paidOn", label: "Fecha", kind: "date" },
          { key: "code", label: "Recibo" },
          { key: "guardian", label: "Pagó" },
          { key: "method", label: "Medio" },
          { key: "reference", label: "Referencia" },
          { key: "amount", label: "Valor", kind: "money" },
        ],
        rows: rows.map((r) => ({ ...r, method: METHOD_LABELS[r.method] })),
        totals: {
          paidOn: "Total",
          reference: byMethod.map((m) => `${m.label}: ${formatCOP(m.total)}`).join(" · ") || null,
          amount: sum(rows, "amount"),
        },
      };
    }
    case "alumnos": {
      return runInTenant(database, { schoolId }, async (tx) => {
        const [rows, categories, payers] = await Promise.all([
          tx
            .select({
              athleteId: athletes.id,
              firstName: athletes.firstName,
              lastName: athletes.lastName,
              birthDate: athletes.birthDate,
              documentNumber: athletes.documentNumber,
              status: enrollments.status,
              startDate: enrollments.startDate,
              group: groups.name,
              level: levels.name,
            })
            .from(enrollments)
            .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
            .innerJoin(groups, eq(groups.id, enrollments.groupId))
            .leftJoin(levels, eq(levels.id, groups.levelId))
            .where(inArray(enrollments.status, ["ACTIVE", "FROZEN"]))
            .orderBy(asc(groups.name), asc(athletes.firstName)),
          tx.select().from(ageCategories).orderBy(asc(ageCategories.position)),
          tx
            .select({
              athleteId: athleteGuardians.athleteId,
              name: sql<string>`${guardians.firstName} || ' ' || ${guardians.lastName}`,
              phone: guardians.phone,
            })
            .from(athleteGuardians)
            .innerJoin(guardians, eq(guardians.id, athleteGuardians.guardianId))
            .where(eq(athleteGuardians.isPayer, true)),
        ]);
        const season = Number(today.slice(0, 4));
        const payerOf = new Map(payers.map((p) => [p.athleteId, p]));
        return {
          title,
          columns: [
            { key: "name", label: "Alumno" },
            { key: "document", label: "Documento" },
            { key: "birthDate", label: "Nacimiento", kind: "date" },
            { key: "category", label: "Categoría" },
            { key: "group", label: "Grupo" },
            { key: "level", label: "Nivel" },
            { key: "status", label: "Estado" },
            { key: "startDate", label: "Desde", kind: "date" },
            { key: "payer", label: "Responsable de pago" },
            { key: "phone", label: "Celular" },
          ],
          rows: rows.map((r) => ({
            name: `${r.firstName} ${r.lastName}`,
            document: r.documentNumber,
            birthDate: r.birthDate,
            category: findAgeCategory(sportsAge(r.birthDate, season), categories)?.name ?? null,
            group: r.group,
            level: r.level,
            status: ENROLLMENT_STATUS_LABELS[r.status],
            startDate: r.startDate,
            payer: payerOf.get(r.athleteId)?.name ?? null,
            phone: payerOf.has(r.athleteId) ? displayPhone(payerOf.get(r.athleteId)!.phone) : null,
          })),
          totals: { name: `${new Set(rows.map((r) => r.athleteId)).size} alumnos` },
        };
      });
    }
    case "altas-y-retiros": {
      const rows = await runInTenant(database, { schoolId }, (tx) =>
        tx
          .select({
            name: sql<string>`${athletes.firstName} || ' ' || ${athletes.lastName}`,
            group: groups.name,
            status: enrollments.status,
            startDate: enrollments.startDate,
            endDate: enrollments.endDate,
            reason: enrollments.withdrawalReason,
            notes: enrollments.statusNotes,
          })
          .from(enrollments)
          .innerJoin(athletes, eq(athletes.id, enrollments.athleteId))
          .innerJoin(groups, eq(groups.id, enrollments.groupId))
          .where(
            sql`(${enrollments.status} not in ('PRE_ENROLLED', 'DISCARDED') and ${enrollments.startDate} between ${range.from} and ${range.to})
              or (${enrollments.status} = 'WITHDRAWN' and ${enrollments.endDate} between ${range.from} and ${range.to})`,
          ),
      );
      const movements = rows
        .flatMap((r) => [
          ...(r.status !== "PRE_ENROLLED" &&
          r.status !== "DISCARDED" &&
          r.startDate >= range.from &&
          r.startDate <= range.to
            ? [{ date: r.startDate, kind: "Alta", name: r.name, group: r.group, reason: null, notes: null }]
            : []),
          ...(r.status === "WITHDRAWN" && r.endDate && r.endDate >= range.from && r.endDate <= range.to
            ? [
                {
                  date: r.endDate,
                  kind: "Retiro",
                  name: r.name,
                  group: r.group,
                  reason: r.reason ? WITHDRAWAL_REASON_LABELS[r.reason] : null,
                  notes: r.notes,
                },
              ]
            : []),
        ])
        .sort((a, b) => a.date.localeCompare(b.date));
      const reasons = new Map<string, number>();
      for (const m of movements) if (m.reason) reasons.set(m.reason, (reasons.get(m.reason) ?? 0) + 1);
      return {
        title,
        columns: [
          { key: "date", label: "Fecha", kind: "date" },
          { key: "kind", label: "Movimiento" },
          { key: "name", label: "Alumno" },
          { key: "group", label: "Grupo" },
          { key: "reason", label: "Motivo de retiro" },
          { key: "notes", label: "Notas" },
        ],
        rows: movements,
        totals: {
          date: "Total",
          kind: `${movements.filter((m) => m.kind === "Alta").length} altas · ${movements.filter((m) => m.kind === "Retiro").length} retiros`,
          reason: [...reasons].map(([r, n]) => `${r}: ${n}`).join(" · ") || null,
        },
      };
    }
    case "asistencia-grupos":
    case "asistencia-profesores":
    case "asistencia-alumnos":
      return attendanceReport(database, schoolId, id, range);
  }
}

const ATTENDANCE_COLUMNS: ReportColumn[] = [
  { key: "present", label: "Presentes", kind: "number" },
  { key: "late", label: "Tarde", kind: "number" },
  { key: "absent", label: "Ausentes", kind: "number" },
  { key: "excused", label: "Excusas", kind: "number" },
  { key: "rate", label: "% asistencia", kind: "percent" },
];

type Counts = { present: number; late: number; absent: number; excused: number };
const emptyCounts = (): Counts => ({ present: 0, late: 0, absent: 0, excused: 0 });
const withRate = (c: Counts) => {
  const rate = attendanceRate(c);
  return { ...c, rate: rate === null ? null : rate / 100 };
};
const STATUS_KEY = { PRESENT: "present", LATE: "late", ABSENT: "absent", EXCUSED: "excused" } as const;

async function attendanceReport(
  database: Database,
  schoolId: string,
  id: "asistencia-grupos" | "asistencia-profesores" | "asistencia-alumnos",
  range: Range,
): Promise<ReportTable> {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [sessionRows, marks, groupRows, coachRows, assignments] = await Promise.all([
      tx
        .select({
          id: sessions.id,
          groupId: sessions.groupId,
          status: sessions.status,
          substituteCoachId: sessions.substituteCoachId,
        })
        .from(sessions)
        .where(between(sessions.date, range.from, range.to)),
      tx
        .select({
          sessionId: attendance.sessionId,
          athleteId: attendance.athleteId,
          status: attendance.status,
          name: sql<string>`${athletes.firstName} || ' ' || ${athletes.lastName}`,
        })
        .from(attendance)
        .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
        .innerJoin(athletes, eq(athletes.id, attendance.athleteId))
        .where(and(eq(sessions.status, "SCHEDULED"), between(sessions.date, range.from, range.to))),
      tx.select({ id: groups.id, name: groups.name }).from(groups),
      tx
        .select({ id: coaches.id, name: sql<string>`${coaches.firstName} || ' ' || ${coaches.lastName}` })
        .from(coaches),
      tx.select().from(groupCoaches),
    ]);
    const groupName = new Map(groupRows.map((g) => [g.id, g.name]));
    const marksBySession = new Map<string, typeof marks>();
    for (const m of marks) marksBySession.set(m.sessionId, [...(marksBySession.get(m.sessionId) ?? []), m]);

    if (id === "asistencia-alumnos") {
      const byAthlete = new Map<
        string,
        { name: string; groups: Set<string>; sessions: number; counts: Counts }
      >();
      for (const m of marks) {
        const session = sessionRows.find((s) => s.id === m.sessionId)!;
        const entry = byAthlete.get(m.athleteId) ?? {
          name: m.name,
          groups: new Set<string>(),
          sessions: 0,
          counts: emptyCounts(),
        };
        entry.groups.add(groupName.get(session.groupId) ?? "");
        entry.sessions++;
        entry.counts[STATUS_KEY[m.status]]++;
        byAthlete.set(m.athleteId, entry);
      }
      const rows = [...byAthlete.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
        .map((e) => ({
          name: e.name,
          group: [...e.groups].join(", "),
          sessions: e.sessions,
          ...withRate(e.counts),
        }));
      return {
        title: REPORTS[id].title,
        columns: [
          { key: "name", label: "Alumno" },
          { key: "group", label: "Grupo" },
          { key: "sessions", label: "Clases", kind: "number" },
          ...ATTENDANCE_COLUMNS,
        ],
        rows,
      };
    }

    type Acc = { name: string; scheduled: number; canceled: number; recorded: number; counts: Counts };
    const acc = new Map<string, Acc>();
    const add = (key: string, name: string, session: (typeof sessionRows)[number]) => {
      const entry = acc.get(key) ?? { name, scheduled: 0, canceled: 0, recorded: 0, counts: emptyCounts() };
      if (session.status === "CANCELED") entry.canceled++;
      else {
        entry.scheduled++;
        const list = marksBySession.get(session.id) ?? [];
        if (list.length > 0) entry.recorded++;
        for (const m of list) entry.counts[STATUS_KEY[m.status]]++;
      }
      acc.set(key, entry);
    };
    const coachName = new Map(coachRows.map((c) => [c.id, c.name]));
    for (const s of sessionRows) {
      if (id === "asistencia-grupos") add(s.groupId, groupName.get(s.groupId) ?? "", s);
      else {
        // La clase cuenta para el reemplazo si lo hay; si no, para los profesores del grupo.
        const responsible = s.substituteCoachId
          ? [s.substituteCoachId]
          : assignments.filter((a) => a.groupId === s.groupId).map((a) => a.coachId);
        for (const coachId of responsible) add(coachId, coachName.get(coachId) ?? "", s);
      }
    }
    const rows = [...acc.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((e) => ({
        name: e.name,
        scheduled: e.scheduled,
        recorded: e.recorded,
        canceled: e.canceled,
        ...withRate(e.counts),
      }));
    const totalCounts = rows.reduce(
      (c, r) => ({
        present: c.present + r.present,
        late: c.late + r.late,
        absent: c.absent + r.absent,
        excused: c.excused + r.excused,
      }),
      emptyCounts(),
    );
    return {
      title: REPORTS[id].title,
      columns: [
        { key: "name", label: id === "asistencia-grupos" ? "Grupo" : "Profesor" },
        { key: "scheduled", label: "Clases", kind: "number" },
        { key: "recorded", label: "Con asistencia", kind: "number" },
        { key: "canceled", label: "Canceladas", kind: "number" },
        ...ATTENDANCE_COLUMNS,
      ],
      rows,
      totals:
        id === "asistencia-grupos"
          ? {
              name: "Total",
              scheduled: sum(rows, "scheduled"),
              recorded: sum(rows, "recorded"),
              canceled: sum(rows, "canceled"),
              ...withRate(totalCounts),
            }
          : undefined,
    };
  });
}

/** Una hoja de Excel con el reporte: encabezados, filas y totales. Porcentajes como número (0–100). */
export function reportSheet(report: ReportTable): Sheet {
  const cell = (c: ReportColumn, v: ReportValue): ReportValue =>
    c.kind === "percent" && typeof v === "number" ? Math.round(v * 1000) / 10 : v;
  const rows: ReportValue[][] = [
    report.columns.map((c) => (c.kind === "percent" ? `${c.label} (%)` : c.label)),
    ...report.rows.map((r) => report.columns.map((c) => cell(c, r[c.key] ?? null))),
  ];
  if (report.totals) rows.push(report.columns.map((c) => cell(c, report.totals![c.key] ?? null)));
  return {
    name: report.title,
    rows,
    widths: report.columns.map((c) => (c.kind && c.kind !== "text" ? 14 : 26)),
  };
}
