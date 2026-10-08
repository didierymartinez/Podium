import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { XLSX_MIME, writeWorkbook } from "@/lib/xlsx";
import { getCurrentUser } from "@/modules/auth/session";
import { registrationSheet } from "@/modules/competitions/competitions";
import { canManagePeople } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

/** Lista de inscritos para la liga (DEP-64). */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/[slug]/competencias/[competitionId]/inscritos">,
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
      name: "Inscritos",
      widths: [28, 18, 16, 14, 8, 14, 30],
      rows: [
        ["Nombre", "Tipo de documento", "Documento", "Nacimiento", "Sexo", "Categoría", "Pruebas"],
        ...sheet.rows.map((r) => [
          r.name,
          r.documentType,
          r.documentNumber,
          r.birthDate,
          r.sex,
          r.category,
          r.events,
        ]),
      ],
    },
  ]);
  return new Response(new Uint8Array(book), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename="inscritos-${sheet.competition.startsOn}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
