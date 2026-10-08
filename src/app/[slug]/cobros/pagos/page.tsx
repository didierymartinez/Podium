import { HandCoins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, Chip, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { addDays, isIsoDate, todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { METHOD_LABELS } from "@/modules/billing/labels";
import { listPayments } from "@/modules/billing/payments";
import { collectionSummary } from "@/modules/billing/statement";
import { getSchoolContext } from "../../data";

export const metadata: Metadata = { title: "Pagos" };

export default async function PaymentsPage({ params, searchParams }: PageProps<"/[slug]/cobros/pagos">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { school } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const from = isIsoDate(sp.desde) ? sp.desde : addDays(today, -30);
  const to = isIsoDate(sp.hasta) ? sp.hasta : today;
  const [items, summary, todaySummary] = await Promise.all([
    listPayments(db, school.id, { from, to }),
    collectionSummary(db, school.id, from, to),
    collectionSummary(db, school.id, today, today),
  ]);
  const sum = (rows: typeof summary) => rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2" action={`/${slug}/cobros/pagos`}>
          <label className="text-sm">
            <span className="block text-ink-soft">Desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={from}
              className="h-10 rounded-xl border border-line bg-surface px-3"
            />
          </label>
          <label className="text-sm">
            <span className="block text-ink-soft">Hasta</span>
            <input
              type="date"
              name="hasta"
              defaultValue={to}
              className="h-10 rounded-xl border border-line bg-surface px-3"
            />
          </label>
          <button type="submit" className={buttonClass("secondary", "h-10")}>
            Ver
          </button>
        </form>
        <Link href={`/${slug}/cobros/pagos/nuevo`} className={buttonClass("primary", "h-10")}>
          <HandCoins className="size-4" /> Registrar pago
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-ink-soft">Recaudo de hoy</p>
          <p className="mt-1 text-2xl font-semibold">{formatCOP(sum(todaySummary))}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {todaySummary.map((s) => `${METHOD_LABELS[s.method]} ${formatCOP(s.total)}`).join(" · ") ||
              "Sin pagos hoy"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-soft">
            Recaudo del {from} al {to}
          </p>
          <p className="mt-1 text-2xl font-semibold">{formatCOP(sum(summary))}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {summary.map((s) => `${METHOD_LABELS[s.method]} ${formatCOP(s.total)}`).join(" · ") ||
              "Sin pagos"}
          </p>
        </Card>
      </div>

      {items.length === 0 ? (
        <Card className="text-center text-sm text-ink-soft">No hay pagos en este rango.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line" aria-label="Pagos">
            {items.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/${slug}/cobros/pagos/${p.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5"
                >
                  <span className="w-20 font-semibold tabular-nums">{p.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.guardianName}</span>
                    <span className="block text-xs text-ink-soft">
                      {p.paidOn} · {METHOD_LABELS[p.method]}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatCOP(p.amount)}</span>
                  {p.status === "VOID" && <Chip>Anulado</Chip>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
