import { timingSafeEqual } from "node:crypto";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { mailer } from "@/lib/mailer";
import { notifier } from "@/lib/notifier";
import { createDailyJobs, runDaily } from "@/modules/cron/daily";

/**
 * Entrega frecuente de notificaciones (cada 5–10 minutos desde el programador del entorno). Respaldo de la
 * entrega inmediata que se dispara al final de cada acción. Mismo secreto que /api/cron/daily.
 */
export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET no está configurado", { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return new Response(null, { status: 401 });
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const { announcementsSent, notificationsDelivered } = createDailyJobs({
    mailer: mailer(),
    notifier: notifier(),
    appUrl,
  });
  const results = await runDaily(db, new Date(), { announcementsSent, notificationsDelivered });
  return Response.json({ ok: results.every((r) => r.ok), schools: results.length });
}
