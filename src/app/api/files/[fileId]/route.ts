import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { storage } from "@/lib/storage";
import { getCurrentUser } from "@/modules/auth/session";
import { asPortalUser } from "@/db/portal";
import { canReadFile, getFile, isFamilyPhoto } from "@/modules/files/files";
import { getMemberSchool } from "@/modules/schools/queries";

/** Verifica sesión, escuela y permiso; responde con una redirección a la URL firmada de 60 s. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[fileId]">) {
  const { fileId } = await ctx.params;
  const slug = request.nextUrl.searchParams.get("escuela") ?? "";
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return new Response(null, { status: 404 });
  const member = await getMemberSchool(db, slug, user.id);
  if (!member) return new Response(null, { status: 404 });
  const file = await getFile(db, member.school.id, fileId);
  if (!file || file.status !== "READY") return new Response(null, { status: 404 });
  // Las familias ven la foto de sus propios hijos (RLS de familia).
  const allowed =
    canReadFile(file.kind, member.roles) ||
    (file.kind === "ATHLETE_PHOTO" &&
      (await asPortalUser(user.id, () => isFamilyPhoto(db, member.school.id, file.id))));
  if (!allowed) return new Response(null, { status: 404 });
  const url = await storage().presignGet(file.storageKey, 60);
  return new Response(null, {
    status: 302,
    headers: {
      // Relativa con el driver local: no depende del host que vea el servidor detrás de un proxy.
      location: url,
      "cache-control": "private, max-age=50",
    },
  });
}
