import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { listGroups } from "@/modules/groups/groups";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { GroupForm } from "../group-form";
import { loadGroupFormOptions } from "../options";

export const metadata: Metadata = { title: "Editar grupo" };

export default async function EditGroupPage({ params }: PageProps<"/[slug]/grupos/[groupId]">) {
  const { slug, groupId } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const [options, groups] = await Promise.all([loadGroupFormOptions(school.id), listGroups(db, school.id)]);
  const group = groups.find((g) => g.id === groupId);
  if (!group) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title={group.name}
        subtitle="Editar grupo"
        back={{ href: `/${slug}/grupos`, label: "Grupos" }}
      />
      <GroupForm
        slug={slug}
        options={options}
        initial={{
          id: group.id,
          name: group.name,
          disciplineId: group.disciplineId,
          levelId: group.levelId ?? "",
          venueId: group.venueId ?? options.venues[0]?.id ?? "",
          capacity: group.capacity,
          defaultFeePlanId: group.defaultFeePlanId ?? "",
          color: group.color,
          schedule: group.schedule,
          headCoachId: group.coaches.find((c) => c.role === "HEAD")?.id ?? "",
          assistantCoachIds: group.coaches.filter((c) => c.role === "ASSISTANT").map((c) => c.id),
        }}
      />
    </div>
  );
}
