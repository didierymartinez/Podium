import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { runInTenant } from "@/db/rls";
import { schools } from "@/db/schema";
import { handleProviderEvent } from "@/modules/billing/online";
import { readBillingPolicy } from "@/modules/billing/policy";
import { wompiProvider } from "@/modules/payments/wompi";

/**
 * Eventos de Wompi de la escuela (ADM-30). La firma se verifica con el secreto de eventos de esa escuela;
 * responder 200 aunque el evento no aplique evita reintentos infinitos (queda en la auditoría y la conciliación).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/wompi/[slug]">) {
  const { slug } = await ctx.params;
  const rows = await db.execute<{ id: string | null }>(sql`select school_id_by_slug(${slug}) as id`);
  const schoolId = rows[0]?.id;
  if (!schoolId) return new Response(null, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const [school] = await runInTenant(db, { schoolId }, (tx) =>
    tx
      .select({ timezone: schools.timezone, settings: schools.settings })
      .from(schools)
      .where(eq(schools.id, schoolId)),
  );
  const outcome = await handleProviderEvent(
    db,
    wompiProvider(),
    { id: schoolId, slug, timezone: school.timezone },
    body,
    readBillingPolicy(school.settings.billing),
  );
  if (outcome === "invalid_signature") return new Response(null, { status: 401 });
  return Response.json({ ok: true, outcome });
}
