import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { canManagePeople } from "@/modules/schools/permissions";
import { getPlan, listExercises } from "@/modules/training/training";
import { getSchoolContext } from "../../../data";
import { PlanBuilder } from "../../plan-builder";

export const metadata: Metadata = { title: "Plan de sesión" };

export default async function PlanPage({ params }: PageProps<"/[slug]/entrenamiento/planes/[planId]">) {
  const { slug, planId } = await params;
  const { school, user, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles) && !roles.includes("COACH")) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/i.test(planId)) notFound();
  const [plan, library] = await Promise.all([
    getPlan(db, school.id, planId),
    listExercises(db, school.id, user.id),
  ]);
  if (!plan) notFound();
  return (
    <div className="space-y-4">
      <PageHeader back={{ href: `/${slug}/entrenamiento`, label: "Entrenamiento" }} title={plan.name} />
      <PlanBuilder
        slug={slug}
        planId={plan.id}
        initial={{
          name: plan.name,
          objective: plan.objective,
          isTemplate: plan.isTemplate,
          items: plan.items.map((i) => ({
            exerciseId: i.exerciseId,
            title: i.title,
            phase: i.phase,
            minutes: i.minutes,
            notes: i.notes ?? "",
          })),
        }}
        library={library.map((e) => ({ id: e.id, name: e.name, component: e.component, minutes: e.minutes }))}
      />
    </div>
  );
}
