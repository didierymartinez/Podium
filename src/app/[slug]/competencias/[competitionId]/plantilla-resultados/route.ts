import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { XLSX_MIME, writeWorkbook } from "@/lib/xlsx";
import { getCurrentUser } from "@/modules/auth/session";
import { RESULT_COLUMNS, registrationSheet } from "@/modules/competitions/competitions";
import { canManagePeople } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

/** Plantilla para importar resultados: una fila por inscrito y prueba (DEP-66). */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/[slug]/competencias/[competitionId]/plantilla-resultados">,
) {
  const { slug, competitionId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(competitionId)) return new Response(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !(canManagePeople(member.roles) || member.roles.includes("COACH")))
    return new Response(null, { status: 404 });
  const sheet = await registrationSheet(db, member.school.id, competitionId);
  if (!sheet) return new Response(null, { status: 404 });
  const book = writeWorkbook([
    {
      name: "Resultados",
      widths: [16, 28, 18, 10, 12, 10, 30],
      rows: [
        RESULT_COLUMNS,
        ...sheet.rows.flatMap((r) =>
          r.events
            .split(", ")
            .filter(Boolean)
            .map((event) => [r.documentNumber, r.name, event, "", "", "", ""]),
        ),
      ],
    },
  ]);
  return new Response(new Uint8Array(book), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename="resultados-${sheet.competition.startsOn}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
