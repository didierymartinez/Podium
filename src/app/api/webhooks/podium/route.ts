import { db } from "@/db/client";
import { mailer } from "@/lib/mailer";
import { wompiProvider } from "@/modules/payments/wompi";
import { podiumPaymentKeys } from "@/modules/subscription/podium-wompi";
import { handlePodiumEvent } from "@/modules/subscription/subscription";

/** Eventos del Wompi de Podium (pagos de suscripciones, #21). La firma se valida con el secreto de eventos. */
export async function POST(request: Request) {
  const keys = podiumPaymentKeys();
  if (!keys) return new Response(null, { status: 503 });
  const body = await request.json().catch(() => null);
  const result = await handlePodiumEvent(db, wompiProvider(), keys, body, new Date(), mailer());
  return new Response(null, { status: result === "invalid" ? 401 : 200 });
}
