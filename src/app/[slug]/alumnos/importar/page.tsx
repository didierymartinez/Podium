import { Download } from "lucide-react";
import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, SectionTitle } from "@/components/ui";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importar alumnos" };

export default async function ImportAthletesPage({ params }: PageProps<"/[slug]/alumnos/importar">) {
  const { slug } = await params;
  const { roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  return (
    <div className="space-y-4">
      <PageHeader title="Importar alumnos" subtitle="Carga tus alumnos y acudientes desde Excel en minutos" />
      <Card>
        <SectionTitle>1. Descarga la plantilla</SectionTitle>
        <p className="text-sm text-ink-soft">
          Una fila por alumno. Los hermanos llevan el mismo celular del acudiente. El grupo y la tarifa deben
          escribirse como están en Podium (la plantilla trae la lista). El saldo pendiente queda como una
          cuenta de &quot;Saldo anterior&quot;.
        </p>
        <a
          href={`/${slug}/alumnos/importar/plantilla`}
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand"
          download
        >
          <Download className="size-4" /> Descargar plantilla de Excel
        </a>
      </Card>
      <ImportWizard slug={slug} />
    </div>
  );
}
