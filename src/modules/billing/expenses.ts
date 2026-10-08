import { and, asc, desc, eq, gte, isNotNull, lte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, expenses, payments, stockMovements } from "@/db/schema";
import { addMonths, type IsoDate } from "@/lib/dates";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "./labels";

/** Egresos y utilidad (ADM-52). */

type Ctx = { schoolId: string; actorUserId: string };

export const expenseSchema = z.object({
  category: z.enum(Object.keys(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, ...ExpenseCategory[]]),
  description: z.string().trim().min(3, "Escribe la descripción").max(160),
  amount: z.number("Escribe el valor").int().positive("Escribe el valor").max(1_000_000_000),
  spentOn: z.iso.date("Escribe la fecha"),
  method: z.enum(["CASH", "TRANSFER", "DEPOSIT", "CARD", "ONLINE"]),
});

export function recordExpense(
  database: Database,
  ctx: Ctx,
  raw: z.input<typeof expenseSchema>,
  today: IsoDate,
) {
  const input = expenseSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    if (input.spentOn > today) return null;
    const [row] = await tx
      .insert(expenses)
      .values({ schoolId: ctx.schoolId, ...input, createdByUserId: ctx.actorUserId })
      .returning({ id: expenses.id });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "expense.recorded",
      entity: "expense",
      entityId: row.id,
      data: input,
    });
    return row.id;
  });
}

export function deleteExpense(database: Database, ctx: Ctx, expenseId: string) {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = await tx.delete(expenses).where(eq(expenses.id, expenseId)).returning();
    if (!row) return false;
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "expense.deleted",
      entity: "expense",
      entityId: expenseId,
      data: {
        category: row.category,
        amount: row.amount,
        spentOn: row.spentOn,
        description: row.description,
      },
    });
    return true;
  });
}

export function listExpenses(database: Database, schoolId: string, from: IsoDate, to: IsoDate) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select()
      .from(expenses)
      .where(and(gte(expenses.spentOn, from), lte(expenses.spentOn, to)))
      .orderBy(desc(expenses.spentOn), desc(expenses.createdAt)),
  );
}

export type MonthProfit = {
  month: string;
  collected: number;
  cashSales: number;
  income: number;
  expenses: number;
  byCategory: Record<ExpenseCategory, number>;
  profit: number;
};

const emptyCategories = () =>
  Object.fromEntries(Object.keys(EXPENSE_CATEGORY_LABELS).map((k) => [k, 0])) as Record<
    ExpenseCategory,
    number
  >;

/**
 * Utilidad por mes (caja): recaudo (pagos confirmados por fecha de pago + ventas de contado del
 * inventario) menos egresos. `months` son "AAAA-MM".
 */
export function profitReport(database: Database, schoolId: string, months: string[]): Promise<MonthProfit[]> {
  if (months.length === 0) return Promise.resolve([]);
  const sorted = [...months].sort();
  const from = `${sorted[0]}-01`;
  const to = `${addMonths(`${sorted[sorted.length - 1]}-01`, 1)}`;
  return runInTenant(database, { schoolId }, async (tx) => {
    const month = (col: unknown) => sql<string>`to_char(${col}, 'YYYY-MM')`;
    const [paid, sales, spent] = await Promise.all([
      tx
        .select({
          month: month(payments.paidOn),
          total: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        })
        .from(payments)
        .where(and(eq(payments.status, "CONFIRMED"), gte(payments.paidOn, from), lt(payments.paidOn, to)))
        .groupBy(month(payments.paidOn)),
      tx
        .select({
          month: month(stockMovements.movedOn),
          total: sql<number>`coalesce(sum(-${stockMovements.quantity} * ${stockMovements.unitPrice}), 0)::int`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.kind, "SALE"),
            isNotNull(stockMovements.method),
            gte(stockMovements.movedOn, from),
            lt(stockMovements.movedOn, to),
          ),
        )
        .groupBy(month(stockMovements.movedOn)),
      tx
        .select({
          month: month(expenses.spentOn),
          category: expenses.category,
          total: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        })
        .from(expenses)
        .where(and(gte(expenses.spentOn, from), lt(expenses.spentOn, to)))
        .groupBy(month(expenses.spentOn), expenses.category)
        .orderBy(asc(expenses.category)),
    ]);
    return months.map((m) => {
      const collected = paid.find((p) => p.month === m)?.total ?? 0;
      const cashSales = sales.find((s) => s.month === m)?.total ?? 0;
      const byCategory = emptyCategories();
      for (const e of spent.filter((x) => x.month === m)) byCategory[e.category] = e.total;
      const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
      return {
        month: m,
        collected,
        cashSales,
        income: collected + cashSales,
        expenses: total,
        byCategory,
        profit: collected + cashSales - total,
      };
    });
  });
}
