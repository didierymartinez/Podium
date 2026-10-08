import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { athletes, creditNotes, enrollments, guardians, invoiceLines, invoices, payments } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { balanceOf, guardianCredit } from "./ledger";

export type Movement = {
  date: IsoDate;
  kind: "invoice" | "credit_note" | "payment" | "void";
  code: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  href?: { invoiceId?: string; paymentId?: string };
};

/** Estado de cuenta de un acudiente (ADM-40): movimientos con saldo corrido, deuda y saldo a favor. */
export function guardianStatement(database: Database, schoolId: string, guardianId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [guardian] = await tx.select().from(guardians).where(eq(guardians.id, guardianId));
    if (!guardian) return null;
    const [invs, notes, pays] = await Promise.all([
      tx.select().from(invoices).where(eq(invoices.guardianId, guardianId)),
      tx
        .select({ note: creditNotes, code: invoices.code, invoiceStatus: invoices.status })
        .from(creditNotes)
        .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
        .where(eq(invoices.guardianId, guardianId)),
      tx.select().from(payments).where(eq(payments.guardianId, guardianId)),
    ]);
    const raw: Omit<Movement, "balance">[] = [
      ...invs
        .filter((i) => i.status !== "VOID")
        .map((i) => ({
          date: i.issuedOn,
          kind: "invoice" as const,
          code: i.code,
          description: i.period ? `Cuenta de cobro ${i.period}` : "Cuenta de cobro",
          debit: i.total,
          credit: 0,
          href: { invoiceId: i.id },
        })),
      ...notes
        .filter((n) => n.invoiceStatus !== "VOID")
        .map((n) => ({
          date: n.note.createdAt.toISOString().slice(0, 10),
          kind: "credit_note" as const,
          code: n.code,
          description: n.note.reason,
          debit: 0,
          credit: n.note.amount,
          href: { invoiceId: n.note.invoiceId },
        })),
      ...pays
        .filter((p) => p.status === "CONFIRMED")
        .map((p) => ({
          date: p.paidOn,
          kind: "payment" as const,
          code: p.code,
          description: "Pago recibido",
          debit: 0,
          credit: p.amount,
          href: { paymentId: p.id },
        })),
    ].sort((a, b) => a.date.localeCompare(b.date) || b.debit - a.debit);
    let running = 0;
    const movements = raw.map((m) => {
      running += m.debit - m.credit;
      return { ...m, balance: running };
    });
    const owed = invs
      .filter((i) => i.status === "PENDING" || i.status === "PARTIAL")
      .reduce((s, i) => s + balanceOf(i), 0);
    return { guardian, movements, owed, credit: await guardianCredit(tx, guardianId) };
  });
}

export const AGING_BUCKETS = [
  { key: "current", label: "Corriente" },
  { key: "d1_30", label: "1–30 días" },
  { key: "d31_60", label: "31–60 días" },
  { key: "d61_90", label: "61–90 días" },
  { key: "d90", label: "Más de 90" },
] as const;
export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

export function agingBucket(dueOn: IsoDate, today: IsoDate): AgingKey {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90";
}

export type DebtorRow = {
  guardianId: string;
  name: string;
  phone: string;
  athletes: string[];
  groupIds: string[];
  buckets: Record<AgingKey, number>;
  total: number;
  overdue: number;
  oldestDueOn: IsoDate;
  openInvoiceIds: string[];
};

const emptyBuckets = (): Record<AgingKey, number> => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 });

/** Cartera por edades (ADM-41) y lista de deudores (ADM-42). */
export function agingReport(database: Database, schoolId: string, today: IsoDate) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const open = await tx
      .select({
        invoice: invoices,
        firstName: guardians.firstName,
        lastName: guardians.lastName,
        phone: guardians.phone,
      })
      .from(invoices)
      .innerJoin(guardians, eq(guardians.id, invoices.guardianId))
      .where(inArray(invoices.status, ["PENDING", "PARTIAL"]))
      .orderBy(asc(invoices.dueOn));
    const ids = open.map((o) => o.invoice.id);
    const lines = ids.length
      ? await tx
          .select({
            invoiceId: invoiceLines.invoiceId,
            athleteName: sql<string>`${athletes.firstName} || ' ' || ${athletes.lastName}`,
            groupId: enrollments.groupId,
          })
          .from(invoiceLines)
          .leftJoin(athletes, eq(athletes.id, invoiceLines.athleteId))
          .leftJoin(enrollments, eq(enrollments.id, invoiceLines.enrollmentId))
          .where(inArray(invoiceLines.invoiceId, ids))
      : [];
    const totals = emptyBuckets();
    const byGuardian = new Map<string, DebtorRow>();
    for (const { invoice, firstName, lastName, phone } of open) {
      const balance = balanceOf(invoice);
      if (balance <= 0) continue;
      const bucket = agingBucket(invoice.dueOn, today);
      totals[bucket] += balance;
      const row = byGuardian.get(invoice.guardianId) ?? {
        guardianId: invoice.guardianId,
        name: `${firstName} ${lastName}`,
        phone,
        athletes: [],
        groupIds: [],
        buckets: emptyBuckets(),
        total: 0,
        overdue: 0,
        oldestDueOn: invoice.dueOn,
        openInvoiceIds: [],
      };
      row.buckets[bucket] += balance;
      row.total += balance;
      if (bucket !== "current") row.overdue += balance;
      row.openInvoiceIds.push(invoice.id);
      for (const l of lines.filter((x) => x.invoiceId === invoice.id)) {
        if (l.athleteName && !row.athletes.includes(l.athleteName)) row.athletes.push(l.athleteName);
        if (l.groupId && !row.groupIds.includes(l.groupId)) row.groupIds.push(l.groupId);
      }
      byGuardian.set(invoice.guardianId, row);
    }
    const debtors = [...byGuardian.values()].sort((a, b) => b.overdue - a.overdue || b.total - a.total);
    return { totals, total: Object.values(totals).reduce((s, v) => s + v, 0), debtors };
  });
}

export type AthleteBilling = { overdue: boolean; balance: number };

/** Al día / en mora por alumno (ADM-43): saldo de cuentas abiertas con líneas suyas; en mora si alguna venció. */
export function athleteBillingStatus(
  database: Database,
  schoolId: string,
  athleteIds: string[],
  today: IsoDate,
) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const result = new Map<string, AthleteBilling>();
    if (athleteIds.length === 0) return result;
    const rows = await tx
      .select({ athleteId: invoiceLines.athleteId, dueOn: invoices.dueOn, invoice: invoices })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .where(
        and(inArray(invoiceLines.athleteId, athleteIds), inArray(invoices.status, ["PENDING", "PARTIAL"])),
      );
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.athleteId) continue;
      const entry = result.get(r.athleteId) ?? { overdue: false, balance: 0 };
      const key = `${r.athleteId}:${r.invoice.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        entry.balance += balanceOf(r.invoice);
      }
      if (r.dueOn < today) entry.overdue = true;
      result.set(r.athleteId, entry);
    }
    return result;
  });
}

/** Recaudo del día o de un rango por medio de pago (ADM-51). */
export function collectionSummary(database: Database, schoolId: string, from: IsoDate, to: IsoDate) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        method: payments.method,
        total: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(and(eq(payments.status, "CONFIRMED"), sql`${payments.paidOn} between ${from} and ${to}`))
      .groupBy(payments.method),
  );
}

/** Facturado del periodo (cuentas no anuladas). */
export async function billedInPeriod(database: Database, schoolId: string, from: IsoDate, to: IsoDate) {
  const [row] = await runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({ total: sql<number>`coalesce(sum(${invoices.total}), 0)::int` })
      .from(invoices)
      .where(and(ne(invoices.status, "VOID"), sql`${invoices.issuedOn} between ${from} and ${to}`)),
  );
  return row.total;
}
