import type { Metadata } from "next";
import Link from "next/link";
import { Card, Chip, cn } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { listInvoices, periodLabel } from "@/modules/billing/invoices";
import { INVOICE_STATUS } from "@/modules/billing/labels";
import { balanceOf } from "@/modules/billing/ledger";
import { getSchoolContext } from "../../data";

export const metadata: Metadata = { title: "Cuentas de cobro" };

const FILTERS = [
  { key: "open", label: "Abiertas" },
  { key: "overdue", label: "Vencidas" },
  { key: "PAID", label: "Pagadas" },
  { key: "VOID", label: "Anuladas" },
  { key: "all", label: "Todas" },
] as const;

export default async function InvoicesPage({ params, searchParams }: PageProps<"/[slug]/cobros/cuentas">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { school } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const filter = FILTERS.find((f) => f.key === sp.estado)?.key ?? "open";
  const period = typeof sp.periodo === "string" && /^\d{4}-\d{2}$/.test(sp.periodo) ? sp.periodo : undefined;
  const items = await listInvoices(db, school.id, {
    status: filter === "all" ? undefined : filter,
    period,
    today,
  });
  const href = (estado: string) =>
    `/${slug}/cobros/cuentas?estado=${estado}${period ? `&periodo=${period}` : ""}`;

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5" aria-label="Filtrar cuentas">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href(f.key)}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold",
              f.key === filter ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft",
            )}
          >
            {f.label}
          </Link>
        ))}
        {period && (
          <Link href={`/${slug}/cobros/cuentas?estado=${filter}`} className="inline-flex h-9 items-center">
            <Chip tone="brand">{periodLabel(period)} ✕</Chip>
          </Link>
        )}
      </nav>
      {items.length === 0 ? (
        <Card className="text-center text-sm text-ink-soft">No hay cuentas con este filtro.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line" aria-label="Cuentas de cobro">
            {items.map((inv) => {
              const status = INVOICE_STATUS[inv.status];
              const overdue = (inv.status === "PENDING" || inv.status === "PARTIAL") && inv.dueOn < today;
              return (
                <li key={inv.id}>
                  <Link
                    href={`/${slug}/cobros/cuentas/${inv.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5"
                  >
                    <span className="w-20 font-semibold tabular-nums">{inv.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{inv.guardianName}</span>
                      <span className="block text-xs text-ink-soft">
                        {inv.period ? periodLabel(inv.period) : "Cobro único"} · vence {inv.dueOn}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{formatCOP(inv.total)}</span>
                      {inv.status !== "VOID" && inv.status !== "PAID" && (
                        <span className="block text-xs text-ink-soft">Saldo {formatCOP(balanceOf(inv))}</span>
                      )}
                    </span>
                    <Chip tone={overdue ? "danger" : status.tone}>{overdue ? "Vencida" : status.label}</Chip>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
