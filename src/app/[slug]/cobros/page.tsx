import { FilePlus2, HandCoins, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, SectionTitle, Tile, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { periodLabel } from "@/modules/billing/invoices";
import { readBillingPolicy } from "@/modules/billing/policy";
import { nextGenerationDate } from "@/modules/billing/schedule";
import { AGING_BUCKETS, agingReport, billedInPeriod, collectionSummary } from "@/modules/billing/statement";
import { listGroups } from "@/modules/groups/groups";
import { getSchoolContext } from "../data";
import { DebtorsList } from "./debtors-list";

export const metadata: Metadata = { title: "Cobros" };

export default async function BillingHomePage({ params }: PageProps<"/[slug]/cobros">) {
  const { slug } = await params;
  const { school } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const policy = readBillingPolicy(school.settings.billing);
  const [aging, collected, billed, groups] = await Promise.all([
    agingReport(db, school.id, today),
    collectionSummary(db, school.id, monthStart, today),
    billedInPeriod(db, school.id, monthStart, today),
    listGroups(db, school.id),
  ]);
  const collectedTotal = collected.reduce((s, c) => s + c.total, 0);
  const overdue = aging.total - aging.totals.current;
  const max = Math.max(1, ...Object.values(aging.totals));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href={`/${slug}/cobros/pagos/nuevo`} className={buttonClass("primary", "h-10")}>
          <HandCoins className="size-4" /> Registrar pago
        </Link>
        <Link href={`/${slug}/cobros/generar`} className={buttonClass("secondary", "h-10")}>
          <Sparkles className="size-4" /> Generar mensualidades
        </Link>
        <Link href={`/${slug}/cobros/cobro-unico`} className={buttonClass("secondary", "h-10")}>
          <FilePlus2 className="size-4" /> Cobro único
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Recaudo de ${periodLabel(today.slice(0, 7))}`} value={formatCOP(collectedTotal)} />
        <Kpi label="Facturado este mes" value={formatCOP(billed)} />
        <Kpi label="Cartera total" value={formatCOP(aging.total)} />
        <Kpi label="Cartera vencida" value={formatCOP(overdue)} danger={overdue > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <SectionTitle>Deudores</SectionTitle>
          <DebtorsList
            slug={slug}
            schoolName={school.name}
            groups={groups.map((g) => ({ id: g.id, name: g.name }))}
            debtors={aging.debtors}
          />
        </Card>
        <div className="space-y-4">
          <Card>
            <SectionTitle>Cartera por edades</SectionTitle>
            <ul className="space-y-2.5" aria-label="Cartera por edades">
              {AGING_BUCKETS.map((b) => (
                <li key={b.key}>
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-soft">{b.label}</span>
                    <span className="font-semibold tabular-nums">{formatCOP(aging.totals[b.key])}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        b.key === "current" ? "h-full rounded-full bg-brand" : "h-full rounded-full bg-danger"
                      }
                      style={{
                        width: `${(aging.totals[b.key] / max) * 100}%`,
                        opacity: b.key === "current" ? 1 : 0.55 + 0.1 * AGING_BUCKETS.indexOf(b),
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SectionTitle>Recaudo del mes por medio</SectionTitle>
            {collected.length === 0 ? (
              <p className="text-sm text-ink-soft">Aún no hay pagos este mes.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {collected.map((c) => (
                  <li key={c.method} className="flex justify-between">
                    <span className="text-ink-soft">
                      {
                        {
                          CASH: "Efectivo",
                          TRANSFER: "Transferencia",
                          DEPOSIT: "Consignación",
                          CARD: "Datáfono",
                          ONLINE: "En línea",
                        }[c.method]
                      }{" "}
                      ({c.count})
                    </span>
                    <span className="font-semibold tabular-nums">{formatCOP(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Tile className="text-sm text-ink-soft">
            Las mensualidades se generan solas el día {policy.generationDay} (próxima:{" "}
            {nextGenerationDate(today, policy.generationDay)}). Puedes revisar y generarlas antes en{" "}
            <Link href={`/${slug}/cobros/generar`} className="font-semibold text-brand">
              Generar mensualidades <Plus className="inline size-3" />
            </Link>
            .
          </Tile>
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
