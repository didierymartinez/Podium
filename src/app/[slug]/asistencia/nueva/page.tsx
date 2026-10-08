import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { isIsoDate, todayIn } from "@/lib/dates";
import { currentMembers, listGroups } from "@/modules/groups/groups";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { ExtraSessionForm } from "./extra-session-form";

export const metadata: Metadata = { title: "Clase extra" };

export default async function NewExtraSessionPage({
  params,
  searchParams,
}: PageProps<"/[slug]/asistencia/nueva">) {
  const { slug } = await params;
  const { fecha, grupo } = await searchParams;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const [groups, members] = await Promise.all([listGroups(db, school.id), currentMembers(db, school.id)]);
  const active = groups.filter((g) => g.active);
  const date = isIsoDate(fecha) ? fecha : todayIn(school.timezone);

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/asistencia?fecha=${date}`, label: "Clases del día" }}
        title="Clase extra"
        subtitle="Reposición, preparación de torneo o una clase especial. Avisamos a las familias citadas."
      />
      <ExtraSessionForm
        slug={slug}
        date={date}
        initialGroupId={
          typeof grupo === "string" && active.some((g) => g.id === grupo) ? grupo : (active[0]?.id ?? "")
        }
        groups={active.map((g) => ({
          id: g.id,
          name: g.name,
          color: g.color,
          members: members.get(g.id) ?? [],
        }))}
      />
    </div>
  );
}
