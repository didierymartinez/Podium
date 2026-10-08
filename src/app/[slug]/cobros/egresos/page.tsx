import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/bar-chart";
import { Card, SectionTitle, buttonClass, cn } from "@/components/ui";
import { db } from "@/db/client";
import { addMonths, todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { listExpenses, profitReport } from "@/modules/billing/expenses";
import { periodLabel } from "@/modules/billing/invoices";
import { EXPENSE_CATEGORY_LABELS, METHOD_LABELS, type ExpenseCategory } from "@/modules/billing/labels";
import { getSchoolContext } from "../../data";
import { DeleteExpenseButton, ExpenseForm } from "./expense-form";

export const metadata: Metadata = { title: "Egresos y utilidad" };

/** Egresos por categoría y utilidad del mes (ADM-52). */
export default async function ExpensesPage({ params, searchParams }: PageProps<"/[slug]/cobros/egresos">) {
  const { slug } = await params;
  const query = await searchParams;
  const { school } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const current = today.slice(0, 7);
  const month =
    typeof query.mes === "string" && /^\d{4}-\d{2}$/.test(query.mes) && query.mes <= current
      ? query.mes
      : current;
  const months = Array.from({ length: 6 }, (_, i) => addMonths(`${month}-01`, i - 5).slice(0, 7));
  const monthEnd = addMonths(`${month}-01`, 1);
  const [report, list] = await Promise.all([
    profitReport(db, school.id, months),
    listExpenses(db, school.id, `${month}-01`, today < monthEnd ? today : monthEnd),
  ]);
  const now = report[report.length - 1];
  const nav = (m: string) => `/${slug}/cobros/egresos?mes=${m}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={nav(addMonths(`${month}-01`, -1).slice(0, 7))}
          className={buttonClass("secondary", "h-9")}
        >
          ← Anterior
        </Link>
        <span className="font-semibold capitalize">{periodLabel(month)}</span>
        {month < current && (
          <Link
            href={nav(addMonths(`${month}-01`, 1).slice(0, 7))}
            className={buttonClass("secondary", "h-9")}
          >
            Siguiente →
          </Link>
        )}
        <a
          href={`/${slug}/cobros/egresos/excel?mes=${month}`}
          className={cn(buttonClass("ghost", "h-9"), "ml-auto")}
        >
          <Download className="size-4" /> Excel
        </a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Utilidad del mes">
        <Kpi label="Recaudo" value={formatCOP(now.collected)} />
        <Kpi label="Ventas de contado" value={formatCOP(now.cashSales)} />
        <Kpi label="Egresos" value={formatCOP(now.expenses)} />
        <Kpi label="Utilidad" value={formatCOP(now.profit)} danger={now.profit < 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <SectionTitle>Ingresos vs. egresos</SectionTitle>
            <BarChart
              title="Ingresos y egresos de los últimos 6 meses"
              categories={report.map((r) => ({ key: r.month, label: periodLabel(r.month).slice(0, 3) }))}
              series={[
                { key: "income", label: "Ingresos", className: "fill-brand" },
                { key: "expenses", label: "Egresos", className: "fill-danger" },
              ]}
              values={Object.fromEntries(
                report.map((r) => [r.month, { income: r.income, expenses: r.expenses }]),
              )}
              format={formatCOP}
            />
          </Card>
          <Card>
            <SectionTitle>Egresos del mes</SectionTitle>
            <ul className="divide-y divide-line text-sm" aria-label="Egresos">
              {list.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="text-ink-soft">{e.spentOn}</span>
                  <span className="flex-1">
                    <span className="font-semibold">{e.description}</span>
                    <span className="block text-xs text-ink-soft">
                      {EXPENSE_CATEGORY_LABELS[e.category]} · {METHOD_LABELS[e.method]}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatCOP(e.amount)}</span>
                  <DeleteExpenseButton slug={slug} expenseId={e.id} description={e.description} />
                </li>
              ))}
              {list.length === 0 && <li className="py-2 text-ink-soft">Sin egresos este mes.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <ExpenseForm slug={slug} today={today} />
          <Card>
            <SectionTitle>Por categoría</SectionTitle>
            <ul className="space-y-1.5 text-sm" aria-label="Egresos por categoría">
              {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[])
                .filter((k) => now.byCategory[k] > 0)
                .map((k) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-ink-soft">{EXPENSE_CATEGORY_LABELS[k]}</span>
                    <span className="font-semibold tabular-nums">{formatCOP(now.byCategory[k])}</span>
                  </li>
                ))}
              {now.expenses === 0 && <li className="text-ink-soft">Sin egresos.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className={danger ? "mt-1 text-2xl font-semibold text-danger" : "mt-1 text-2xl font-semibold"}>
        {value}
      </p>
    </Card>
  );
}
