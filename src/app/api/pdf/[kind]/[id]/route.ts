import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { storage } from "@/lib/storage";
import { getCurrentUser } from "@/modules/auth/session";
import { billingPdf, type PdfKind } from "@/modules/billing/documents";
import { guardianIdsOfUser } from "@/modules/portal/family";
import { canManagePeople } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

const KINDS: PdfKind[] = ["cuenta", "recibo", "estado", "paz-y-salvo"];

/** PDFs de cobros: la administración ve todos; cada familia solo los suyos. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/pdf/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if (!KINDS.includes(kind as PdfKind) || !/^[0-9a-f-]{36}$/i.test(id))
    return new Response(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, request.nextUrl.searchParams.get("escuela") ?? "", user.id);
  if (!member) return new Response(null, { status: 404 });
  const owner = canManagePeople(member.roles) ? null : await guardianIdsOfUser(db, member.school.id, user.id);
  const generate = () =>
    billingPdf(db, storage(), member.school.id, kind as PdfKind, id, owner, request.nextUrl.origin);
  // Las familias generan el PDF con las políticas RLS de familia activas.
  const pdf = owner === null ? await generate() : await asPortalUser(user.id, generate);
  if (!pdf) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pdf.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
