import { ChevronRight, Download, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, SectionTitle } from "@/components/ui";
import { REPORTS, type ReportId } from "@/modules/reports/reports";
import { canManagePeople, canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";

export const metadata: Metadata = { title: "Reportes" };

const SECTIONS: { title: string; ids: ReportId[] }[] = [
  { title: "Cobros", ids: ["facturado-vs-recaudado", "cartera", "pagos"] },
  { title: "Alumnos", ids: ["alumnos", "altas-y-retiros"] },
  { title: "Asistencia", ids: ["asistencia-grupos", "asistencia-profesores", "asistencia-alumnos"] },
];

export default async function ReportsPage({ params }: PageProps<"/[slug]/reportes">) {
  const { slug } = await params;
  const { roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  return (
    <div className="space-y-4">
      <PageHeader title="Reportes" subtitle="Consulta y exporta a Excel" />
      <div className="grid gap-4 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <SectionTitle>{section.title}</SectionTitle>
            <ul className="space-y-2">
              {section.ids.map((id) => (
                <li key={id}>
                  <Link
                    href={`/${slug}/reportes/${id}`}
                    className="flex items-center gap-3 rounded-2xl bg-canvas px-3 py-2.5 hover:bg-muted"
                  >
                    <FileSpreadsheet className="size-4 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{REPORTS[id].title}</span>
                      <span className="block text-xs text-ink-soft">{REPORTS[id].description}</span>
                    </span>
                    <ChevronRight className="size-4 text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      {canManageSettings(roles) && (
        <Card>
          <SectionTitle>Exportación completa</SectionTitle>
          <p className="text-sm text-ink-soft">
            Descarga todos los datos de la escuela (alumnos, acudientes, matrículas, asistencia, cuentas,
            pagos, avisos y auditoría) en un ZIP con un archivo CSV por tabla. Tus datos son tuyos.
          </p>
          <a
            href={`/${slug}/reportes/exportar-todo`}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand"
            download
          >
            <Download className="size-4" /> Descargar exportación completa
          </a>
        </Card>
      )}
    </div>
  );
}
