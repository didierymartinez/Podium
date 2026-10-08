import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { GroupForm } from "../group-form";
import { loadGroupFormOptions } from "../options";

export const metadata: Metadata = { title: "Nuevo grupo" };

export default async function NewGroupPage({ params }: PageProps<"/[slug]/grupos/nuevo">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const options = await loadGroupFormOptions(school.id);
  const discipline = options.disciplines[0];

  return (
    <div className="space-y-5">
      <PageHeader title="Nuevo grupo" back={{ href: `/${slug}/grupos`, label: "Grupos" }} />
      <GroupForm
        slug={slug}
        options={options}
        initial={{
          name: "",
          disciplineId: discipline?.id ?? "",
          levelId: discipline?.levels[0]?.id ?? "",
          capacity: 15,
          defaultFeePlanId: options.feePlans[0]?.id ?? "",
          color: "#2f6bff",
          schedule: [
            { weekday: 0, startTime: "16:00", endTime: "18:00" },
            { weekday: 2, startTime: "16:00", endTime: "18:00" },
            { weekday: 4, startTime: "16:00", endTime: "18:00" },
          ],
        }}
      />
    </div>
  );
}
