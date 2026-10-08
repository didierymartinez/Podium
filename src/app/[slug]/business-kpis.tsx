import { ArrowDownRight, ArrowUpRight, Clock } from "lucide-react";
import Link from "next/link";
import { BarChart } from "@/components/bar-chart";
import { Card, SectionTitle, Tile } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import type { BusinessMetrics, MonthPoint } from "@/modules/dashboard/metrics";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const percent = (n: number) => `${Math.round(n * 100)} %`;
const compactCOP = (n: number) =>
  n >= 1_000_000
    ? `$ ${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`
    : formatCOP(n);

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <Tile className="p-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p
        className={
          tone === "danger" ? "mt-1 text-xl font-semibold text-danger" : "mt-1 text-xl font-semibold"
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
    </Tile>
  );
}

/** Tablero del administrador (§12.1): indicadores del mes y facturado vs. recaudado. */
export function BusinessKpis({
  slug,
  metrics: m,
  trend,
}: {
  slug: string;
  metrics: BusinessMetrics;
  trend: MonthPoint[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <Card>
        <SectionTitle
          action={
            <Link href={`/${slug}/cobros`} className="text-sm font-semibold text-brand">
              Ver cobros
            </Link>
          }
        >
          Indicadores del mes
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Indicadores del mes">
          <Kpi
            label="Recaudo del mes"
            value={formatCOP(m.collected)}
            hint={`Facturado ${formatCOP(m.billed)}`}
          />
          <Kpi label="% de recaudo" value={percent(m.collectionRate)} hint="De las cuentas del mes" />
          <Kpi
            label="Cartera vencida"
            value={formatCOP(m.overdue)}
            tone={m.overdue > 0 ? "danger" : undefined}
          />
          <Kpi label="Ingreso promedio" value={formatCOP(m.averageRevenue)} hint="Por alumno activo" />
          <Kpi label="Alumnos activos" value={String(m.activeAthletes)} />
          <Tile className="p-3">
            <p className="text-xs text-ink-soft">Nuevos / retirados</p>
            <p className="mt-1 flex items-center gap-3 text-xl font-semibold">
              <span className="inline-flex items-center text-mint">
                <ArrowUpRight className="size-4" /> {m.newAthletes}
              </span>
              <span className="inline-flex items-center text-danger">
                <ArrowDownRight className="size-4" /> {m.withdrawnAthletes}
              </span>
            </p>
          </Tile>
          <Kpi
            label="Retención"
            value={percent(m.retention)}
            hint={`Activos al inicio: ${m.activeAtStart}`}
          />
          <Kpi label="Ocupación" value={percent(m.occupancy)} hint={`${m.enrolled} de ${m.capacity} cupos`} />
        </div>
        {m.pendingOnlinePayments.count > 0 && (
          <Link
            href={`/${slug}/cobros/pagos`}
            className="mt-3 flex items-center gap-2 rounded-2xl bg-sun/30 px-4 py-2.5 text-sm"
          >
            <Clock className="size-4 shrink-0" />
            <span>
              <strong>{m.pendingOnlinePayments.count} pagos en línea por verificar</strong> (
              {formatCOP(m.pendingOnlinePayments.amount)})
            </span>
          </Link>
        )}
      </Card>
      <Card>
        <SectionTitle>Facturado vs. recaudado</SectionTitle>
        <BarChart
          title="Facturado vs. recaudado por mes"
          categories={trend.map((p) => ({ key: p.period, label: MONTHS[Number(p.period.slice(5)) - 1] }))}
          series={[
            { key: "billed", label: "Facturado", className: "fill-brand/30" },
            { key: "collected", label: "Recaudado", className: "fill-brand" },
          ]}
          values={Object.fromEntries(
            trend.map((p) => [p.period, { billed: p.billed, collected: p.collected }]),
          )}
          format={compactCOP}
        />
      </Card>
    </div>
  );
}
