import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { enrollments, groups, invoices, paymentIntents, payments } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";

/** Indicadores del tablero del administrador (§12.1 de docs/GESTION_ADMINISTRATIVA.md). */

const pad = (n: number) => String(n).padStart(2, "0");
export const monthStart = (date: IsoDate) => `${date.slice(0, 7)}-01`;
export function monthEnd(date: IsoDate) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return `${date.slice(0, 7)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
/** "2026-10" desplazado n meses. */
export function shiftMonth(period: string, n: number) {
  const index = Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1 + n;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Proporción segura (0 si no hay base). */
export const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

export type BusinessMetrics = {
  period: string;
  collected: number;
  billed: number;
  /** Pagado de las cuentas emitidas en el mes ÷ su valor neto. */
  collectionRate: number;
  overdue: number;
  activeAthletes: number;
  newAthletes: number;
  withdrawnAthletes: number;
  activeAtStart: number;
  /** 1 − retirados ÷ activos al inicio del mes. */
  retention: number;
  enrolled: number;
  capacity: number;
  occupancy: number;
  averageRevenue: number;
  pendingOnlinePayments: { count: number; amount: number };
};

export function businessMetrics(
  database: Database,
  schoolId: string,
  today: IsoDate,
): Promise<BusinessMetrics> {
  const from = monthStart(today);
  const to = monthEnd(today);
  return runInTenant(database, { schoolId }, async (tx) => {
    const [[collected], [billedRow], [overdueRow], [athleteRow], [capacityRow], [intentRow]] =
      await Promise.all([
        tx
          .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
          .from(payments)
          .where(and(eq(payments.status, "CONFIRMED"), sql`${payments.paidOn} between ${from} and ${to}`)),
        tx
          .select({
            total: sql<number>`coalesce(sum(${invoices.total}), 0)::int`,
            net: sql<number>`coalesce(sum(${invoices.total} - ${invoices.credited}), 0)::int`,
            paid: sql<number>`coalesce(sum(least(${invoices.paid}, ${invoices.total} - ${invoices.credited})), 0)::int`,
          })
          .from(invoices)
          .where(and(ne(invoices.status, "VOID"), sql`${invoices.issuedOn} between ${from} and ${to}`)),
        tx
          .select({
            total: sql<number>`coalesce(sum(greatest(${invoices.total} - ${invoices.credited} - ${invoices.paid}, 0)), 0)::int`,
          })
          .from(invoices)
          .where(and(inArray(invoices.status, ["PENDING", "PARTIAL"]), sql`${invoices.dueOn} < ${today}`)),
        tx
          .select({
            active: sql<number>`count(distinct ${enrollments.athleteId}) filter (where ${enrollments.status} = 'ACTIVE')::int`,
            // Primera matrícula real del alumno dentro del mes.
            new: sql<number>`(select count(*)::int from (
              select athlete_id from enrollments where status not in ('PRE_ENROLLED', 'DISCARDED')
              group by athlete_id having min(start_date) between ${from} and ${to}) n)`,
            withdrawn: sql<number>`count(distinct ${enrollments.athleteId}) filter (where ${enrollments.status} = 'WITHDRAWN'
              and ${enrollments.endDate} between ${from} and ${to})::int`,
            activeAtStart: sql<number>`count(distinct ${enrollments.athleteId}) filter (
              where ${enrollments.status} not in ('PRE_ENROLLED', 'DISCARDED') and ${enrollments.startDate} < ${from}
              and (${enrollments.endDate} is null or ${enrollments.endDate} >= ${from}))::int`,
            enrolled: sql<number>`count(*) filter (where ${enrollments.status} in ('PRE_ENROLLED', 'ACTIVE', 'FROZEN')
              and exists (select 1 from groups g where g.id = "enrollments"."group_id" and g.active))::int`,
          })
          .from(enrollments),
        tx
          .select({ capacity: sql<number>`coalesce(sum(${groups.capacity}), 0)::int` })
          .from(groups)
          .where(eq(groups.active, true)),
        tx
          .select({
            count: sql<number>`count(*)::int`,
            amount: sql<number>`coalesce(sum(${paymentIntents.amount}), 0)::int`,
          })
          .from(paymentIntents)
          .where(eq(paymentIntents.status, "PENDING")),
      ]);
    return {
      period: today.slice(0, 7),
      collected: collected.total,
      billed: billedRow.total,
      collectionRate: ratio(billedRow.paid, billedRow.net),
      overdue: overdueRow.total,
      activeAthletes: athleteRow.active,
      newAthletes: athleteRow.new,
      withdrawnAthletes: athleteRow.withdrawn,
      activeAtStart: athleteRow.activeAtStart,
      retention: athleteRow.activeAtStart > 0 ? 1 - ratio(athleteRow.withdrawn, athleteRow.activeAtStart) : 1,
      enrolled: athleteRow.enrolled,
      capacity: capacityRow.capacity,
      occupancy: ratio(athleteRow.enrolled, capacityRow.capacity),
      averageRevenue: Math.round(ratio(billedRow.total, athleteRow.active)),
      pendingOnlinePayments: { count: intentRow.count, amount: intentRow.amount },
    };
  });
}

export type MonthPoint = { period: string; billed: number; collected: number };

/** Facturado vs. recaudado de los últimos `months` meses (incluido el actual). */
export function billedVsCollected(
  database: Database,
  schoolId: string,
  today: IsoDate,
  months = 12,
): Promise<MonthPoint[]> {
  const current = today.slice(0, 7);
  const first = shiftMonth(current, -(months - 1));
  return runInTenant(database, { schoolId }, async (tx) => {
    const [billed, collected] = await Promise.all([
      tx
        .select({
          period: sql<string>`to_char(${invoices.issuedOn}, 'YYYY-MM')`,
          total: sql<number>`sum(${invoices.total})::int`,
        })
        .from(invoices)
        .where(and(ne(invoices.status, "VOID"), sql`${invoices.issuedOn} >= ${`${first}-01`}`))
        .groupBy(sql`1`),
      tx
        .select({
          period: sql<string>`to_char(${payments.paidOn}, 'YYYY-MM')`,
          total: sql<number>`sum(${payments.amount})::int`,
        })
        .from(payments)
        .where(and(eq(payments.status, "CONFIRMED"), sql`${payments.paidOn} >= ${`${first}-01`}`))
        .groupBy(sql`1`),
    ]);
    const b = new Map(billed.map((r) => [r.period, r.total]));
    const c = new Map(collected.map((r) => [r.period, r.total]));
    return Array.from({ length: months }, (_, i) => {
      const period = shiftMonth(first, i);
      return { period, billed: b.get(period) ?? 0, collected: c.get(period) ?? 0 };
    });
  });
}
