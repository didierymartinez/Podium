import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { XLSX_MIME, writeWorkbook } from "@/lib/xlsx";
import { getCurrentUser } from "@/modules/auth/session";
import { travelList } from "@/modules/competitions/competitions";
import { canManagePeople } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

/**
 * Lista de viaje (DEP-65) para llevar en el celular sin conexión. Incluye datos médicos confidenciales:
 * solo la administración la descarga.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/[slug]/competencias/[competitionId]/viaje">,
) {
  const { slug, competitionId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(competitionId)) return new Response(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !canManagePeople(member.roles)) return new Response(null, { status: 404 });
  const list = await travelList(db, member.school.id, competitionId);
  if (!list) return new Response(null, { status: 404 });
  const book = writeWorkbook([
    {
      name: "Lista de viaje",
      widths: [26, 18, 12, 8, 18, 32, 30, 40, 20],
      rows: [
        [
          "Nombre",
          "Documento",
          "Nacimiento",
          "RH",
          "EPS",
          "Datos médicos",
          "Contacto de emergencia",
          "Acudientes",
          "Servicios",
        ],
        ...list.rows.map((r) => [
          r.name,
          r.document,
          r.birthDate,
          r.bloodType,
          r.healthInsurer,
          r.medicalNotes,
          r.emergency,
          r.guardians,
          r.extras,
        ]),
      ],
    },
  ]);
  return new Response(new Uint8Array(book), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename="lista-de-viaje-${list.competition.startsOn}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
