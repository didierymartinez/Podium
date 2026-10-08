import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { storage } from "@/lib/storage";
import { getCurrentUser } from "@/modules/auth/session";
import { canManagePeople } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";
import { evaluationCertificate } from "@/modules/sports/certificate";

/** Certificado de nivel (DEP-44): la escuela ve todos; cada familia solo los de sus hijos (RLS). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/certificados/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, request.nextUrl.searchParams.get("escuela") ?? "", user.id);
  if (!member) return new Response(null, { status: 404 });
  const staff = canManagePeople(member.roles) || member.roles.includes("COACH");
  const generate = () => evaluationCertificate(db, storage(), member.school.id, id);
  const pdf = staff ? await generate() : await asPortalUser(user.id, generate);
  if (!pdf) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${encodeURIComponent(pdf.filename)}"`,
      "cache-control": "private, no-store",
    },
  });
}
