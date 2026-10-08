import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Alert, Card, Chip, SectionTitle, type ChipTone } from "@/components/ui";
import { db } from "@/db/client";
import { formatLongDate, isoDateOf } from "@/lib/dates";
import { mailer } from "@/lib/mailer";
import { formatCOP } from "@/lib/money";
import { wompiProvider } from "@/modules/payments/wompi";
import { canManageSubscription } from "@/modules/schools/permissions";
import { trialDaysLeft } from "@/modules/schools/trial";
import { ANNUAL_MONTHS, INTERVAL_LABELS, PLANS, priceOf } from "@/modules/subscription/plans";
import { podiumPaymentKeys, wompiApiBase } from "@/modules/subscription/podium-wompi";
import { GRACE_DAYS, getSubscription, reconcileReference } from "@/modules/subscription/subscription";
import { getSchoolContext } from "../data";
import { BillingProfileForm } from "./billing-profile-form";
import { CancelForm } from "./cancel-form";
import { PlanPicker } from "./plan-picker";

export const metadata: Metadata = { title: "Suscripción" };

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  TRIAL: { label: "Prueba gratis", tone: "brand" },
  ACTIVE: { label: "Activa", tone: "mint" },
  PAST_DUE: { label: "Pago pendiente", tone: "sun" },
  READ_ONLY: { label: "Solo lectura", tone: "danger" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
};
const INVOICE_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  PENDING: { label: "Pendiente", tone: "sun" },
  PAID: { label: "Pagada", tone: "mint" },
  FAILED: { label: "Rechazada", tone: "danger" },
  VOID: { label: "Anulada", tone: "neutral" },
};

export default async function SubscriptionPage({ params, searchParams }: PageProps<"/[slug]/suscripcion">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManageSubscription(roles))
    return <NoAccess message="Solo el propietario de la escuela maneja la suscripción a Podium." />;
  const keys = podiumPaymentKeys();
  const ref = (await searchParams).ref;
  const returned =
    typeof ref === "string"
      ? await reconcileReference(db, school.id, ref, wompiProvider(), keys, new Date(), mailer())
      : null;
  const view = await getSubscription(db, school.id);
  const { subscription: sub } = view;
  const status = STATUS[view.school.status];
  const now = new Date();
  const periodEnd = sub.currentPeriodEnd ? isoDateOf(sub.currentPeriodEnd, school.timezone) : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Suscripción" subtitle="Tu plan de Podium" />
      {returned === "paid" && <Alert tone="info">¡Pago aprobado! Tu suscripción quedó activa.</Alert>}
      {returned === "declined" && <Alert>El pago no fue aprobado. Intenta de nuevo o usa otro medio.</Alert>}
      {returned === "pending" && (
        <Alert tone="info">Tu pago está en verificación. Te avisaremos por email.</Alert>
      )}

      <Card>
        <SectionTitle
          action={
            <Chip tone={status.tone} dot>
              {status.label}
            </Chip>
          }
        >
          Estado
        </SectionTitle>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <p>
            <span className="block text-ink-soft">Plan</span>
            <strong>
              {view.plan ? `${view.plan.name} · ${INTERVAL_LABELS[sub.interval]}` : "Prueba gratis"}
            </strong>
          </p>
          <p>
            <span className="block text-ink-soft">Alumnos activos</span>
            <strong>
              {view.activeAthletes}
              {view.plan?.maxAthletes ? ` de ${view.plan.maxAthletes}` : ""}
            </strong>
          </p>
          <p>
            <span className="block text-ink-soft">
              {view.school.status === "TRIAL"
                ? "Prueba hasta"
                : sub.canceledAt
                  ? "Activa hasta"
                  : "Próximo cobro"}
            </span>
            <strong>
              {view.school.status === "TRIAL" && view.school.trialEndsAt
                ? `${formatLongDate(isoDateOf(view.school.trialEndsAt, school.timezone))} (${trialDaysLeft(view.school.trialEndsAt, now)} días)`
                : periodEnd
                  ? formatLongDate(periodEnd)
                  : "—"}
            </strong>
          </p>
        </div>
        {view.school.status === "PAST_DUE" && (
          <p className="mt-3 text-sm text-ink-soft">
            Tienes {GRACE_DAYS} días de gracia para pagar antes de pasar a solo lectura. Los pagos de las
            familias no se afectan.
          </p>
        )}
        {view.overLimit && (
          <Alert tone="info">
            Superaste el límite de tu plan. No bloqueamos nada: en tu próximo cobro pasarás al plan{" "}
            {view.suggested.name}.
          </Alert>
        )}
        {sub.method === "CARD" && sub.cardLabel && (
          <p className="mt-3 text-sm text-ink-soft">Cobro automático con {sub.cardLabel}.</p>
        )}
      </Card>

      <Card>
        <SectionTitle>Datos de facturación</SectionTitle>
        <BillingProfileForm
          slug={slug}
          initial={{
            legalName: view.school.legalName ?? "",
            documentType: view.school.documentType ?? "NIT",
            documentNumber: view.school.documentNumber ?? "",
            address: view.school.address ?? "",
            billingEmail: sub.billingEmail ?? view.school.contactEmail ?? "",
          }}
        />
      </Card>

      {view.school.status !== "CANCELED" && (
        <Card>
          <SectionTitle>{view.plan ? "Cambiar o renovar plan" : "Elige tu plan"}</SectionTitle>
          {!keys && (
            <div className="mb-3">
              <Alert tone="info">
                Los pagos en línea de Podium se están configurando. Escríbenos por WhatsApp y activamos tu
                plan.
              </Alert>
            </div>
          )}
          {keys && !view.profileComplete && (
            <p className="mb-3 text-sm text-ink-soft">Completa los datos de facturación para poder pagar.</p>
          )}
          <PlanPicker
            slug={slug}
            plans={PLANS.map((p) => ({
              code: p.code,
              name: p.name,
              maxAthletes: p.maxAthletes,
              monthly: priceOf(p, "MONTHLY"),
              annual: priceOf(p, "ANNUAL"),
            }))}
            suggested={view.suggested.code}
            current={view.plan?.code ?? null}
            enabled={Boolean(keys) && view.profileComplete}
            card={keys ? { publicKey: keys.publicKey, apiBase: wompiApiBase(keys) } : null}
          />
          <p className="mt-3 text-xs text-ink-soft">
            Precios en pesos colombianos. El plan anual equivale a {ANNUAL_MONTHS} mensualidades.
          </p>
        </Card>
      )}

      <Card>
        <SectionTitle>Pagos a Podium</SectionTitle>
        <ul className="divide-y divide-line text-sm" aria-label="Pagos a Podium">
          {view.invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="flex-1">
                {i.reference} · {i.periodStart} a {i.periodEnd}
              </span>
              <span className="font-semibold tabular-nums">{formatCOP(i.amount)}</span>
              <Chip tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Chip>
            </li>
          ))}
          {view.invoices.length === 0 && <li className="py-2 text-ink-soft">Aún no hay pagos.</li>}
        </ul>
      </Card>

      {view.school.status !== "CANCELED" && !sub.canceledAt && (
        <Card>
          <SectionTitle>Cancelar</SectionTitle>
          <CancelForm slug={slug} exportHref={`/${slug}/reportes/exportar-todo`} />
        </Card>
      )}
    </div>
  );
}
