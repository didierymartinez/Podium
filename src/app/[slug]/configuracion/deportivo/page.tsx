import type { Metadata } from "next";
import { db } from "@/db/client";
import { canManageSettings } from "@/modules/schools/permissions";
import { getStructure } from "@/modules/sports/structure";
import { getSchoolContext } from "../../data";
import { CategoriesCard, DisciplinesCard, LevelsCard, TestsCard } from "./structure-editor";
import { TargetsCard } from "./targets-card";
import { listTargets } from "@/modules/sports/performances";
import { listCriteria } from "@/modules/sports/evaluations";
import { CriteriaCard } from "./criteria-card";

export const metadata: Metadata = { title: "Estructura deportiva" };

export default async function SportsSettingsPage({ params }: PageProps<"/[slug]/configuracion/deportivo">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  const canEdit = canManageSettings(roles);
  const [s, targets, criteria] = await Promise.all([
    getStructure(db, school.id),
    listTargets(db, school.id),
    listCriteria(db, school.id),
  ]);
  const active = s.disciplines.filter((d) => d.active);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <DisciplinesCard
          slug={slug}
          canEdit={canEdit}
          disciplines={s.disciplines.map((d) => ({
            id: d.id,
            name: d.name,
            active: d.active,
            groups: d.groups,
          }))}
          available={s.available.map((d) => ({ code: d.code, name: d.name }))}
        />
        {active.map((d) => (
          <LevelsCard
            key={d.id}
            slug={slug}
            canEdit={canEdit}
            discipline={{ id: d.id, name: d.name }}
            levels={d.levels.map((l) => ({
              id: l.id,
              name: l.name,
              goal: l.goal,
              active: l.active,
              groups: l.groups,
            }))}
          />
        ))}
        <CriteriaCard
          slug={slug}
          canEdit={canEdit}
          levels={active.flatMap((d) =>
            d.levels
              .filter((l) => l.active)
              .map((l) => ({ id: l.id, name: active.length > 1 ? `${d.name} · ${l.name}` : l.name })),
          )}
          criteria={criteria.map((c) => ({ id: c.id, levelId: c.levelId, name: c.name }))}
        />
      </div>
      <div className="space-y-4">
        <CategoriesCard
          slug={slug}
          canEdit={canEdit}
          categories={s.categories.map((c) => ({
            id: c.id,
            name: c.name,
            minAge: c.minAge,
            maxAge: c.maxAge,
          }))}
        />
        <TestsCard
          slug={slug}
          canEdit={canEdit}
          disciplines={active.map((d) => ({ id: d.id, name: d.name }))}
          tests={s.tests.map((t) => ({
            id: t.id,
            disciplineId: t.disciplineId,
            name: t.name,
            kind: t.kind,
            unit: t.unit,
            lowerIsBetter: t.lowerIsBetter,
            context: t.context,
            active: t.active,
          }))}
        />
        <TargetsCard
          slug={slug}
          canEdit={canEdit}
          tests={s.tests
            .filter((t) => t.active)
            .map((t) => ({ id: t.id, name: t.name, kind: t.kind, unit: t.unit }))}
          categories={s.categories.map((c) => ({ id: c.id, name: c.name }))}
          targets={targets.map((t) => ({ testId: t.testId, ageCategoryId: t.ageCategoryId, value: t.value }))}
        />
      </div>
    </div>
  );
}
