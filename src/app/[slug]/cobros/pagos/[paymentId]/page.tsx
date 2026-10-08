import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Alert, Card, Chip, SectionTitle, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { formatCOP } from "@/lib/money";
import { METHOD_LABELS, pdfHref } from "@/modules/billing/labels";
import { getPayment } from "@/modules/billing/payments";
import { fileHref } from "@/modules/files/files";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../../data";
import { VoidPaymentCard } from "./void-payment-card";

export const metadata: Metadata = { title: "Recibo de caja" };

export default async function PaymentPage({ params }: PageProps<"/[slug]/cobros/pagos/[paymentId]">) {
  const { slug, paymentId } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!/^[0-9a-f-]{36}$/.test(paymentId)) notFound();
  const data = await getPayment(db, school.id, paymentId);
  if (!data) notFound();
  const { payment, guardian, allocations, credit } = data;

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/cobros/pagos`, label: "Pagos" }}
        title={`Recibo ${payment.code}`}
        subtitle={
          <Link href={`/${slug}/acudientes/${guardian.id}`} className="font-semibold text-brand">
            {guardian.firstName} {guardian.lastName}
          </Link>
        }
        actions={
          <>
            {payment.status === "VOID" && <Chip>Anulado</Chip>}
            <a
              href={pdfHref(slug, "recibo", payment.id)}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary", "h-10")}
            >
              <Download className="size-4" /> Recibo PDF
            </a>
          </>
        }
      />
      {payment.status === "VOID" && <Alert>Anulado: {payment.voidReason}</Alert>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <SectionTitle>Pago</SectionTitle>
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-ink-soft">Valor</dt>
            <dd className="text-lg font-semibold">{formatCOP(payment.amount)}</dd>
            <dt className="text-ink-soft">Fecha</dt>
            <dd>{payment.paidOn}</dd>
            <dt className="text-ink-soft">Medio</dt>
            <dd>{METHOD_LABELS[payment.method]}</dd>
            {payment.reference && (
              <>
                <dt className="text-ink-soft">Referencia</dt>
                <dd>{payment.reference}</dd>
              </>
            )}
            {payment.notes && (
              <>
                <dt className="text-ink-soft">Notas</dt>
                <dd>{payment.notes}</dd>
              </>
            )}
            {payment.proofFileId && (
              <>
                <dt className="text-ink-soft">Soporte</dt>
                <dd>
                  <a
                    href={fileHref(slug, payment.proofFileId)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand"
                  >
                    Ver soporte
                  </a>
                </dd>
              </>
            )}
          </dl>
          <SectionTitle>Aplicado a</SectionTitle>
          <ul className="divide-y divide-line text-sm" aria-label="Aplicación del pago">
            {allocations.map((a) => (
              <li key={a.invoiceId} className="flex justify-between py-2">
                <Link href={`/${slug}/cobros/cuentas/${a.invoiceId}`} className="hover:text-brand">
                  Cuenta {a.code}
                </Link>
                <span className="tabular-nums">{formatCOP(a.amount)}</span>
              </li>
            ))}
            {credit > 0 && (
              <li className="flex justify-between py-2 font-semibold text-mint">
                <span>Saldo a favor</span>
                <span className="tabular-nums">{formatCOP(credit)}</span>
              </li>
            )}
          </ul>
        </Card>
        {payment.status !== "VOID" && canManageSettings(roles) && (
          <VoidPaymentCard slug={slug} paymentId={payment.id} />
        )}
      </div>
    </div>
  );
}
