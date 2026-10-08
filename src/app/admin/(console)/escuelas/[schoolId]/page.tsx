import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { db } from "@/db/client";
import { isoDateOf } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { requirePlatformAdmin } from "@/modules/auth/session";
import { schoolDetail } from "@/modules/platform/console";
import { PLANS, planOf } from "@/modules/subscription/plans";
import { STATUS_CHIP } from "../../labels";
import { ActivatePlanForm, CouponForm, ExtendTrialForm, SupportForm, SuspendForm } from "./admin-forms";

export const metadata: Metadata = { title: "Escuela · Consola de Podium" };

export default async function SchoolAdminPage({ params }: PageProps<"/admin/escuelas/[schoolId]">) {
  await requirePlatformAdmin();
  const { schoolId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(schoolId)) notFound();
  const detail = await schoolDetail(db, schoolId);
  if (!detail) notFound();
  const { school, subscription: sub, invoices, audit } = detail;
  const tz = school.timezone;

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          action={
            <span className="flex gap-1">
              <Chip tone={STATUS_CHIP[school.status].tone}>{STATUS_CHIP[school.status].label}</Chip>
              {school.suspendedAt && <Chip tone="danger">Suspendida</Chip>}
            </span>
          }
        >
          {school.name}
        </SectionTitle>
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-ink-soft">URL</dt>
            <dd>/{school.slug}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Plan</dt>
            <dd>
              {planOf(sub.planCode)?.name ?? "Prueba"} · {sub.interval === "ANNUAL" ? "Anual" : "Mensual"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">Prueba hasta</dt>
            <dd>{school.trialEndsAt ? isoDateOf(school.trialEndsAt, tz) : "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Periodo pagado hasta</dt>
            <dd>{sub.currentPeriodEnd ? isoDateOf(sub.currentPeriodEnd, tz) : "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Descuento</dt>
            <dd>
              {sub.discountPercent ? `${sub.discountPercent} % hasta ${sub.discountUntil ?? "siempre"}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">Método</dt>
            <dd>
              {sub.method === "CARD"
                ? `Tarjeta ${sub.cardLabel ?? ""}`
                : sub.method === "LINK"
                  ? "Link de pago"
                  : "—"}
            </dd>
          </div>
          {school.suspendedReason && (
            <div className="sm:col-span-2">
              <dt className="text-ink-soft">Motivo de suspensión</dt>
              <dd>{school.suspendedReason}</dd>
            </div>
          )}
        </dl>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <SectionTitle>Prueba</SectionTitle>
          <ExtendTrialForm schoolId={school.id} />
        </Card>
        <Card>
          <SectionTitle>Descuento o cupón</SectionTitle>
          <CouponForm schoolId={school.id} percent={sub.discountPercent} until={sub.discountUntil} />
        </Card>
        <Card>
          <SectionTitle>Activar plan</SectionTitle>
          <ActivatePlanForm schoolId={school.id} plans={PLANS.map((p) => ({ code: p.code, name: p.name }))} />
        </Card>
        <Card>
          <SectionTitle>Soporte</SectionTitle>
          <SupportForm schoolId={school.id} />
        </Card>
        <Card>
          <SectionTitle>Abuso</SectionTitle>
          <SuspendForm schoolId={school.id} suspended={Boolean(school.suspendedAt)} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Pagos a Podium</SectionTitle>
          <ul className="divide-y divide-line text-sm">
            {invoices.map((i) => (
              <li key={i.id} className="flex gap-3 py-2">
                <span className="flex-1">
                  {i.reference} · {i.periodStart} a {i.periodEnd}
                </span>
                <span className="tabular-nums">{formatCOP(i.amount)}</span>
                <span>{i.status}</span>
              </li>
            ))}
            {invoices.length === 0 && <li className="py-2 text-ink-soft">Sin pagos.</li>}
          </ul>
        </Card>
        <Card>
          <SectionTitle>Auditoría reciente</SectionTitle>
          <ul className="divide-y divide-line text-sm" aria-label="Auditoría reciente">
            {audit.map((a) => (
              <li key={a.id} className="py-2">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="block text-xs text-ink-soft">
                  {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
