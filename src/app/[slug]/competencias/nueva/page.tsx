import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { addDays, todayIn } from "@/lib/dates";
import { listDocumentTypes } from "@/modules/documents/documents";
import { canManagePeople } from "@/modules/schools/permissions";
import { getStructure } from "@/modules/sports/structure";
import { getSchoolContext } from "../../data";
import { CompetitionForm } from "./competition-form";

export const metadata: Metadata = { title: "Nueva competencia" };

export default async function NewCompetitionPage({ params }: PageProps<"/[slug]/competencias/nueva">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles) && !roles.includes("COACH")) return <NoAccess />;
  const [structure, docs] = await Promise.all([
    getStructure(db, school.id),
    listDocumentTypes(db, school.id),
  ]);
  const today = todayIn(school.timezone);
  return (
    <div className="space-y-4">
      <PageHeader back={{ href: `/${slug}/competencias`, label: "Competencias" }} title="Nueva competencia" />
      <CompetitionForm
        slug={slug}
        today={today}
        defaults={{ startsOn: addDays(today, 30), deadline: addDays(today, 15), city: school.city ?? "" }}
        categories={structure.categories.map((c) => ({ id: c.id, name: c.name }))}
        documentTypes={docs.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name }))}
      />
    </div>
  );
}
