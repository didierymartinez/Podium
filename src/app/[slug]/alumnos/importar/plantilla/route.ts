import { db } from "@/db/client";
import { XLSX_MIME, writeWorkbook } from "@/lib/xlsx";
import { getCurrentUser } from "@/modules/auth/session";
import { importTemplate } from "@/modules/imports/athletes";
import { canManagePeople } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

/** Plantilla de Excel para importar alumnos, con los grupos y tarifas de la escuela. */
export async function GET(_request: Request, ctx: RouteContext<"/[slug]/alumnos/importar/plantilla">) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !canManagePeople(member.roles)) return new Response(null, { status: 404 });
  const book = writeWorkbook(await importTemplate(db, member.school.id));
  return new Response(new Uint8Array(book), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename="plantilla-alumnos-${slug}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
