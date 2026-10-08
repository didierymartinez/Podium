import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/bar-chart";
import { Card, Chip, SectionTitle, Tile, cn, inputClass } from "@/components/ui";
import { db } from "@/db/client";
import { addDays, todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { requirePlatformAdmin } from "@/modules/auth/session";
import {
  listPlatformSchools,
  platformMetrics,
  platformSignups,
  setupScore,
} from "@/modules/platform/console";
import { planOf } from "@/modules/subscription/plans";
import { STATUS_CHIP } from "./labels";

export const metadata: Metadata = { title: "Consola de Podium" };

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Tile className="p-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </Tile>
  );
}

export default async function ConsolePage({ searchParams }: PageProps<"/admin">) {
  const admin = await requirePlatformAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const status = typeof sp.estado === "string" && sp.estado in STATUS_CHIP ? sp.estado : "";
  const today = todayIn("America/Bogota");
  const [rows, signups] = await Promise.all([
    listPlatformSchools(db, admin.id),
    platformSignups(db, admin.id, addDays(today, -29)),
  ]);
  const m = platformMetrics(rows, new Date());
  const filtered = rows.filter(
    (r) =>
      (!status || r.status === status) &&
      (!q || [r.name, r.slug, r.city, r.owner_email].some((v) => v.toLowerCase().includes(q))),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <Card>
          <SectionTitle>Métricas</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Métricas de la plataforma">
            <Kpi label="MRR" value={formatCOP(m.mrr)} hint="Suscripciones activas y en mora" />
            <Kpi label="Escuelas" value={String(m.schools)} hint={`${m.suspended} suspendidas`} />
            <Kpi label="En prueba" value={String(m.byStatus.TRIAL)} />
            <Kpi label="Pagando" value={String(m.byStatus.ACTIVE + m.byStatus.PAST_DUE)} />
            <Kpi label="Conversión" value={pct(m.conversion)} hint="Prueba terminada → pagó" />
            <Kpi label="Churn del mes" value={pct(m.churn)} />
            <Kpi label="Configuración" value={pct(m.setup)} hint="Promedio de pasos hechos" />
            <Kpi
              label="Solo lectura"
              value={String(m.byStatus.READ_ONLY)}
              hint={`${m.byStatus.CANCELED} canceladas`}
            />
          </div>
        </Card>
        <Card>
          <SectionTitle>Registros (30 días)</SectionTitle>
          <BarChart
            title="Registros por día"
            categories={signups.map((d) => ({ key: d.day, label: d.day.slice(8) }))}
            series={[
              { key: "users", label: "Usuarios", className: "fill-brand/30" },
              { key: "schools", label: "Escuelas", className: "fill-brand" },
            ]}
            values={Object.fromEntries(signups.map((d) => [d.day, { users: d.users, schools: d.schools }]))}
            format={(n) => String(n)}
          />
        </Card>
      </div>

      <Card className="p-0">
        <form className="flex flex-wrap gap-2 p-4" action="/admin">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar escuela, ciudad o email"
            className={cn(inputClass, "max-w-sm")}
            aria-label="Buscar escuelas"
          />
          <select
            name="estado"
            defaultValue={status}
            className={cn(inputClass, "max-w-[200px]")}
            aria-label="Estado"
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_CHIP).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button className="rounded-full border border-line px-4 text-sm font-semibold">Filtrar</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" aria-label="Escuelas">
            <thead className="border-y border-line text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-2">Escuela</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2 text-right">Alumnos</th>
                <th className="px-4 py-2 text-right">Configuración</th>
                <th className="px-4 py-2">Propietario</th>
                <th className="px-4 py-2">Creada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <Link href={`/admin/escuelas/${r.id}`} className="font-semibold text-brand">
                      {r.name}
                    </Link>
                    <span className="block text-xs text-ink-soft">
                      /{r.slug} · {r.city}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Chip tone={STATUS_CHIP[r.status].tone}>{STATUS_CHIP[r.status].label}</Chip>
                    {r.suspended_at && (
                      <Chip tone="danger" className="ml-1">
                        Suspendida
                      </Chip>
                    )}
                  </td>
                  <td className="px-4 py-2">{(r.plan_code && planOf(r.plan_code)?.name) || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.active_athletes}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{pct(setupScore(r))}</td>
                  <td className="px-4 py-2">{r.owner_email}</td>
                  <td className="px-4 py-2">{todayIn("America/Bogota", r.created_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-soft">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
