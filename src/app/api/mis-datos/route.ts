import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { getCurrentUser } from "@/modules/auth/session";
import { exportMyData } from "@/modules/portal/privacy";
import { getMemberSchool } from "@/modules/schools/queries";

/** Derecho de acceso (Ley 1581): descarga en JSON de los datos de la persona en esta escuela. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, request.nextUrl.searchParams.get("escuela") ?? "", user.id);
  if (!member) return new Response(null, { status: 404 });
  const data = await asPortalUser(user.id, () => exportMyData(db, member.school.id, user.id));
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="mis-datos-${member.school.slug}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
