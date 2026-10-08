import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { XLSX_MIME, writeWorkbook } from "@/lib/xlsx";
import { getCurrentUser } from "@/modules/auth/session";
import { buildReport, isReportId, reportSheet } from "@/modules/reports/reports";
import { canManagePeople } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";
import { readRange } from "../../range";

/** Reporte en Excel con los mismos filtros de la pantalla. */
export async function GET(request: NextRequest, ctx: RouteContext<"/[slug]/reportes/[reportId]/excel">) {
  const { slug, reportId } = await ctx.params;
  if (!isReportId(reportId)) return new Response(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !canManagePeople(member.roles)) return new Response(null, { status: 404 });
  const { range, today } = readRange(request.nextUrl.searchParams, member.school.timezone);
  const report = await buildReport(db, member.school.id, reportId, range, today);
  const book = writeWorkbook([reportSheet(report)]);
  return new Response(new Uint8Array(book), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename="${reportId}-${today}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
