import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { CoachForm } from "../coach-form";

export const metadata: Metadata = { title: "Nuevo profesor" };

export default async function NewCoachPage({ params }: PageProps<"/[slug]/profesores/nuevo">) {
  const { slug } = await params;
  const { roles } = await getSchoolContext(slug);
  if (!canManageSettings(roles)) return <NoAccess />;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Nuevo profesor" back={{ href: `/${slug}/profesores`, label: "Profesores" }} />
      <CoachForm
        slug={slug}
        initial={{
          firstName: "",
          lastName: "",
          documentType: "CC",
          documentNumber: "",
          phone: "",
          email: "",
          specialty: "",
          hiredOn: "",
        }}
      />
    </div>
  );
}
