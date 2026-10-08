import { timingSafeEqual } from "node:crypto";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { mailer } from "@/lib/mailer";
import { notifier } from "@/lib/notifier";
import { createDailyJobs, runDaily } from "@/modules/cron/daily";
import { podiumPaymentKeys } from "@/modules/subscription/podium-wompi";

/**
 * Tareas diarias (regla de portabilidad #6). Cualquier programador sirve: Vercel Cron, `cron` del VPS,
 * Cloud Scheduler o GitHub Actions, enviando `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET no está configurado", { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response(null, { status: 401 });
  }
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const results = await runDaily(
    db,
    new Date(),
    createDailyJobs({ mailer: mailer(), notifier: notifier(), appUrl, podiumKeys: podiumPaymentKeys() }),
  );
  const failed = results.filter((r) => !r.ok).length;
  return Response.json(
    { ok: failed === 0, schools: results.length, failed, results },
    { status: failed ? 500 : 200 },
  );
}
