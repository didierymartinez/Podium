import type { NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES, storage } from "@/lib/storage";

/** Solo para STORAGE_DRIVER=local: sirve las URLs firmadas de subida y descarga. */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/storage/[...key]">) {
  const store = storage();
  if (!store.handlePut) return new Response(null, { status: 404 });
  const { key } = await ctx.params;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES) return new Response(null, { status: 413 });
  const body = Buffer.from(await request.arrayBuffer());
  const status = await store.handlePut(
    key.join("/"),
    request.nextUrl.searchParams,
    request.headers.get("content-type") ?? "",
    body,
    MAX_UPLOAD_BYTES,
  );
  return new Response(null, { status });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/storage/[...key]">) {
  const store = storage();
  if (!store.handleGet) return new Response(null, { status: 404 });
  const { key } = await ctx.params;
  const result = await store.handleGet(key.join("/"), request.nextUrl.searchParams);
  if (result.status !== 200 || !result.body) return new Response(null, { status: result.status });
  return new Response(new Uint8Array(result.body), {
    headers: {
      "content-type": result.contentType ?? "application/octet-stream",
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}
