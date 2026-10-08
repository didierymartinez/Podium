import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { NewAthleteForm } from "../new-athlete-form";
import { loadEnrollmentOptions } from "../options";

export const metadata: Metadata = { title: "Nuevo alumno" };

export default async function NewAthletePage({ params }: PageProps<"/[slug]/alumnos/nuevo">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const options = await loadEnrollmentOptions(school);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Nuevo alumno" back={{ href: `/${slug}/alumnos`, label: "Alumnos" }} />
      <NewAthleteForm slug={slug} options={options} />
    </div>
  );
}
