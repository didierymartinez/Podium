import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { canManagePeople } from "@/modules/schools/permissions";
import { listExercises } from "@/modules/training/training";
import { getSchoolContext } from "../../../data";
import { PlanBuilder } from "../../plan-builder";

export const metadata: Metadata = { title: "Nuevo plan de sesión" };

export default async function NewPlanPage({ params }: PageProps<"/[slug]/entrenamiento/planes/nuevo">) {
  const { slug } = await params;
  const { school, user, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles) && !roles.includes("COACH")) return <NoAccess />;
  const library = await listExercises(db, school.id, user.id);
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/entrenamiento`, label: "Entrenamiento" }}
        title="Nuevo plan de sesión"
      />
      <PlanBuilder
        slug={slug}
        planId={null}
        initial={{ name: "", objective: "", isTemplate: false, items: [] }}
        library={library.map((e) => ({ id: e.id, name: e.name, component: e.component, minutes: e.minutes }))}
      />
    </div>
  );
}
