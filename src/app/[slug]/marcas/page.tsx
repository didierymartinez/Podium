import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, SectionTitle } from "@/components/ui";
import { db } from "@/db/client";
import { runInTenant } from "@/db/rls";
import { todayIn } from "@/lib/dates";
import { listGroups } from "@/modules/groups/groups";
import { canManagePeople } from "@/modules/schools/permissions";
import { formatPerformance } from "@/modules/sports/format";
import { coachGroupIds, groupAthletes, recentPerformances } from "@/modules/sports/performances";
import { activeTests } from "@/modules/sports/structure";
import { getSchoolContext } from "../data";
import { MarksRecorder } from "./marks-recorder";

export const metadata: Metadata = { title: "Marcas" };

/** Registro de marcas en lote con cronómetro (DEP-50, DEP-53). */
export default async function MarksPage({ params }: PageProps<"/[slug]/marcas">) {
  const { slug } = await params;
  const { school, user, roles } = await getSchoolContext(slug);
  const manager = canManagePeople(roles);
  if (!manager && !roles.includes("COACH")) return <NoAccess />;
  const all = (await listGroups(db, school.id)).filter((g) => g.active);
  const mine = manager
    ? all
    : await runInTenant(db, { schoolId: school.id }, (tx) => coachGroupIds(tx, user.id)).then((ids) =>
        all.filter((g) => ids.includes(g.id)),
      );
  const [tests, rosters, recent] = await Promise.all([
    activeTests(db, school.id),
    Promise.all(mine.map(async (g) => [g.id, await groupAthletes(db, school.id, g.id)] as const)),
    recentPerformances(db, school.id, 15),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Marcas"
        subtitle="Registra tiempos y pruebas por grupo; las mejores marcas se avisan solas"
      />
      <MarksRecorder
        slug={slug}
        today={todayIn(school.timezone)}
        groups={mine.map((g) => ({ id: g.id, name: g.name, disciplineId: g.disciplineId }))}
        rosters={Object.fromEntries(
          rosters.map(([id, list]) => [
            id,
            list.map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}` })),
          ]),
        )}
        tests={tests.map((t) => ({
          id: t.id,
          name: t.name,
          kind: t.kind,
          unit: t.unit,
          disciplineId: t.disciplineId,
        }))}
      />
      <Card>
        <SectionTitle>Últimas marcas</SectionTitle>
        <ul className="divide-y divide-line text-sm" aria-label="Últimas marcas">
          {recent.map(({ mark, test, firstName, lastName }) => (
            <li key={mark.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">
                {firstName} {lastName} · {test.name}
              </span>
              <span className="text-ink-soft">{mark.recordedOn}</span>
              <span className="font-semibold tabular-nums">
                {formatPerformance(test.kind, test.unit, mark.value)}
              </span>
            </li>
          ))}
          {recent.length === 0 && <li className="py-2 text-ink-soft">Aún no hay marcas.</li>}
        </ul>
      </Card>
    </div>
  );
}
