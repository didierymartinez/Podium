import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { runInTenant } from "@/db/rls";
import { listGuardians } from "@/modules/athletes/guardians";
import { coachGroupIds } from "@/modules/announcements/announcements";
import { listGroups } from "@/modules/groups/groups";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSportsStructure } from "@/modules/schools/queries";
import { getSchoolContext } from "../../data";
import { AnnouncementEditor } from "./announcement-editor";

export const metadata: Metadata = { title: "Nuevo aviso" };

export default async function NewAnnouncementPage({ params }: PageProps<"/[slug]/avisos/nuevo">) {
  const { slug } = await params;
  const { school, user, roles } = await getSchoolContext(slug);
  const manager = canManagePeople(roles);
  if (!manager && !roles.includes("COACH")) return <NoAccess />;
  const [groups, structure, guardians, mine] = await Promise.all([
    listGroups(db, school.id),
    getSportsStructure(db, school.id),
    manager ? listGuardians(db, school.id) : Promise.resolve([]),
    manager
      ? Promise.resolve(null)
      : runInTenant(db, { schoolId: school.id }, (tx) => coachGroupIds(tx, user.id)),
  ]);
  const visibleGroups = groups.filter((g) => g.active && (!mine || mine.includes(g.id)));
  return (
    <div className="space-y-4">
      <PageHeader back={{ href: `/${slug}/avisos`, label: "Avisos" }} title="Nuevo aviso" />
      <AnnouncementEditor
        slug={slug}
        schoolName={school.name}
        manager={manager}
        groups={visibleGroups.map((g) => ({ id: g.id, name: g.name }))}
        levels={structure.disciplines.flatMap((d) => d.levels.map((l) => ({ id: l.id, name: l.name })))}
        categories={structure.ageCategories.map((c) => ({ id: c.id, name: c.name }))}
        people={guardians.map((g) => ({
          id: g.id,
          name: `${g.firstName} ${g.lastName}`,
          detail: g.athletes.map((a) => a.name).join(", "),
        }))}
      />
    </div>
  );
}
