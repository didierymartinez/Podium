import { Download } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Button, Card, Input, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { formatShortDate } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import {
  REPORTS,
  buildReport,
  isReportId,
  type ReportColumn,
  type ReportValue,
} from "@/modules/reports/reports";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { readRange } from "../range";

export async function generateMetadata({
  params,
}: PageProps<"/[slug]/reportes/[reportId]">): Promise<Metadata> {
  const { reportId } = await params;
  return { title: isReportId(reportId) ? REPORTS[reportId].title : "Reportes" };
}

function show(column: ReportColumn, value: ReportValue) {
  if (value === null || value === "") return "—";
  if (typeof value === "number") {
    if (column.kind === "money") return formatCOP(value);
    if (column.kind === "percent") return `${Math.round(value * 100)} %`;
    return value.toLocaleString("es-CO");
  }
  if (column.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatShortDate(value);
  return value;
}

export default async function ReportPage({ params, searchParams }: PageProps<"/[slug]/reportes/[reportId]">) {
  const { slug, reportId } = await params;
  if (!isReportId(reportId)) notFound();
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const { range, today } = readRange(await searchParams, school.timezone);
  const report = await buildReport(db, school.id, reportId, range, today);
  const meta = REPORTS[reportId];
  const query = meta.usesRange ? `?desde=${range.from}&hasta=${range.to}` : "";
  const numeric = (c: ReportColumn) => c.kind !== undefined && c.kind !== "text" && c.kind !== "date";

  return (
    <div className="space-y-4">
      <PageHeader
        title={meta.title}
        subtitle={meta.description}
        actions={
          <a
            href={`/${slug}/reportes/${reportId}/excel${query}`}
            className={buttonClass("primary", "h-10")}
            download
          >
            <Download className="size-4" /> Exportar a Excel
          </a>
        }
      />
      {meta.usesRange && (
        <Card className="p-4">
          <form className="flex flex-wrap items-end gap-3" action={`/${slug}/reportes/${reportId}`}>
            <label className="text-sm">
              <span className="mb-1 block text-ink-soft">Desde</span>
              <Input type="date" name="desde" defaultValue={range.from} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-soft">Hasta</span>
              <Input type="date" name="hasta" defaultValue={range.to} />
            </label>
            <Button type="submit" variant="secondary">
              Ver
            </Button>
          </form>
        </Card>
      )}
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" aria-label={meta.title}>
            <thead className="border-b border-line text-xs text-ink-soft">
              <tr>
                {report.columns.map((c) => (
                  <th key={c.key} className={numeric(c) ? "px-4 py-3 text-right" : "px-4 py-3"}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.rows.map((row, i) => (
                <tr key={i}>
                  {report.columns.map((c) => (
                    <td
                      key={c.key}
                      className={numeric(c) ? "px-4 py-2 text-right tabular-nums" : "px-4 py-2"}
                    >
                      {show(c, row[c.key] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={report.columns.length} className="px-4 py-6 text-center text-ink-soft">
                    No hay datos en este periodo.
                  </td>
                </tr>
              )}
            </tbody>
            {report.totals && report.rows.length > 0 && (
              <tfoot className="border-t border-line font-semibold">
                <tr>
                  {report.columns.map((c) => (
                    <td
                      key={c.key}
                      className={numeric(c) ? "px-4 py-3 text-right tabular-nums" : "px-4 py-3"}
                    >
                      {report.totals![c.key] === undefined ? "" : show(c, report.totals![c.key])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
