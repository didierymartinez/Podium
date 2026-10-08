import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarChart } from "@/components/bar-chart";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Alert, Card, SectionTitle } from "@/components/ui";
import { db } from "@/db/client";
import { runInTenant } from "@/db/rls";
import { todayIn } from "@/lib/dates";
import { listCompetitions } from "@/modules/competitions/competitions";
import { listGroups } from "@/modules/groups/groups";
import { canManagePeople } from "@/modules/schools/permissions";
import { coachGroupIds } from "@/modules/sports/performances";
import { groupLoad, listPeriods } from "@/modules/training/periodization";
import { getSchoolContext } from "../../../data";
import { PeriodTimeline } from "./period-timeline";

export const metadata: Metadata = { title: "Planificación del grupo" };

const fmt = (n: number) => n.toLocaleString("es-CO");
const shortWeek = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Macro/mesociclos (DEP-33) y carga sRPE con alertas (DEP-36) de un grupo. */
export default async function GroupPlanningPage({
  params,
}: PageProps<"/[slug]/entrenamiento/grupos/[groupId]">) {
  const { slug, groupId } = await params;
  const { school, user, roles } = await getSchoolContext(slug);
  const manager = canManagePeople(roles);
  if (!manager && !roles.includes("COACH")) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/i.test(groupId)) notFound();
  const group = (await listGroups(db, school.id)).find((g) => g.id === groupId);
  if (!group) notFound();
  const mine =
    manager ||
    (await runInTenant(db, { schoolId: school.id }, (tx) => coachGroupIds(tx, user.id))).includes(groupId);
  if (!mine) return <NoAccess />;
  const today = todayIn(school.timezone);
  const [periods, load, competitions] = await Promise.all([
    listPeriods(db, school.id, groupId),
    groupLoad(db, school.id, groupId, today, 8),
    listCompetitions(db, school.id),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/entrenamiento`, label: "Entrenamiento" }}
        title={`Planificación · ${group.name}`}
        subtitle="Temporada, mesociclos y carga de entrenamiento"
      />
      <PeriodTimeline
        slug={slug}
        groupId={groupId}
        today={today}
        periods={periods.map(({ period: p, competitionName, competitionDate }) => ({
          id: p.id,
          kind: p.kind,
          phase: p.phase,
          name: p.name,
          objective: p.objective,
          startsOn: p.startsOn,
          endsOn: p.endsOn,
          competition: competitionName ? `${competitionName} (${competitionDate})` : null,
        }))}
        competitions={competitions
          .filter((c) => c.endsOn >= today)
          .map((c) => ({ id: c.id, name: c.name, startsOn: c.startsOn }))}
      />
      <Card aria-label="Carga de entrenamiento">
        <SectionTitle>Carga semanal (RPE × minutos)</SectionTitle>
        {load.spikes.map((s) => (
          <Alert key={s.week}>
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="size-4" /> La semana del {s.week} subió {s.increase} % frente a la
              anterior ({fmt(s.previous)} → {fmt(s.load)}).
            </span>
          </Alert>
        ))}
        {load.weeks.every((w) => w.load === 0) ? (
          <p className="text-sm text-ink-soft">
            Aún no hay registros post-sesión con RPE. Se cargan al cerrar cada clase en la asistencia.
          </p>
        ) : (
          <BarChart
            title="Carga semanal del grupo"
            categories={load.weeks.map((w) => ({ key: w.week, label: shortWeek(w.week) }))}
            series={[{ key: "load", label: "Carga", className: "fill-brand" }]}
            values={Object.fromEntries(load.weeks.map((w) => [w.week, { load: w.load }]))}
            format={fmt}
          />
        )}
        {load.athletes.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Carga por alumno">
              <thead className="text-left text-ink-soft">
                <tr>
                  <th className="py-1 font-semibold">Alumno</th>
                  {load.weeks.map((w) => (
                    <th key={w.week} className="py-1 text-right font-semibold">
                      {shortWeek(w.week)}
                    </th>
                  ))}
                  <th className="py-1 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {load.athletes.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-1.5">
                      {a.name}
                      {a.spikes.length > 0 && (
                        <AlertTriangle
                          className="ml-1 inline size-3.5 text-danger"
                          aria-label="Aumento brusco"
                        />
                      )}
                    </td>
                    {load.weeks.map((w) => (
                      <td key={w.week} className="py-1.5 text-right tabular-nums">
                        {a.weeks[w.week] ? fmt(a.weeks[w.week]) : "—"}
                      </td>
                    ))}
                    <td className="py-1.5 text-right font-semibold tabular-nums">{fmt(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
