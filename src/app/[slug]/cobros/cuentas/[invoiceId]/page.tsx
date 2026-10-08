import { Download, HandCoins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Alert, Card, Chip, SectionTitle, Tile, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { getInvoice, periodLabel } from "@/modules/billing/invoices";
import { INVOICE_STATUS, METHOD_LABELS, pdfHref } from "@/modules/billing/labels";
import { balanceOf } from "@/modules/billing/ledger";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../../data";
import { InvoiceActions } from "./invoice-actions";

export const metadata: Metadata = { title: "Cuenta de cobro" };

export default async function InvoicePage({ params }: PageProps<"/[slug]/cobros/cuentas/[invoiceId]">) {
  const { slug, invoiceId } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!/^[0-9a-f-]{36}$/.test(invoiceId)) notFound();
  const data = await getInvoice(db, school.id, invoiceId);
  if (!data) notFound();
  const { invoice, guardian, lines, creditNotes, allocations } = data;
  const today = todayIn(school.timezone);
  const balance = invoice.status === "VOID" ? 0 : balanceOf(invoice);
  const overdue = balance > 0 && invoice.dueOn < today;
  const status = INVOICE_STATUS[invoice.status];

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/cobros/cuentas`, label: "Cuentas" }}
        title={`Cuenta ${invoice.code}`}
        subtitle={
          <>
            <Link href={`/${slug}/acudientes/${guardian.id}`} className="font-semibold text-brand">
              {guardian.firstName} {guardian.lastName}
            </Link>{" "}
            · {invoice.period ? periodLabel(invoice.period) : "Cobro único"} · vence {invoice.dueOn}
          </>
        }
        actions={
          <>
            <Chip tone={overdue ? "danger" : status.tone}>{overdue ? "Vencida" : status.label}</Chip>
            <a
              href={pdfHref(slug, "cuenta", invoice.id)}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary", "h-10")}
            >
              <Download className="size-4" /> PDF
            </a>
            {balance > 0 && (
              <Link
                href={`/${slug}/cobros/pagos/nuevo?acudiente=${guardian.id}&cuenta=${invoice.id}`}
                className={buttonClass("primary", "h-10")}
              >
                <HandCoins className="size-4" /> Registrar pago
              </Link>
            )}
          </>
        }
      />
      {invoice.status === "VOID" && <Alert>Anulada: {invoice.voidReason}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <SectionTitle>Detalle</SectionTitle>
          <ul className="divide-y divide-line text-sm" aria-label="Líneas de la cuenta">
            {lines.map((l) => (
              <li key={l.id} className="flex items-start gap-3 py-2.5">
                <span className="min-w-0 flex-1">{l.description}</span>
                <span className="text-right tabular-nums">
                  {l.siblingDiscount > 0 && (
                    <span className="block text-xs text-ink-soft">
                      {formatCOP(l.baseAmount)} − hermanos {formatCOP(l.siblingDiscount)}
                    </span>
                  )}
                  <span className="font-semibold">{formatCOP(l.amount)}</span>
                </span>
              </li>
            ))}
            <li className="flex justify-between py-2.5 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCOP(invoice.total)}</span>
            </li>
            {creditNotes.map((n) => (
              <li key={n.id} className="flex justify-between py-2.5 text-ink-soft">
                <span>Nota crédito · {n.reason}</span>
                <span className="tabular-nums">−{formatCOP(n.amount)}</span>
              </li>
            ))}
            {allocations.map((a) => (
              <li key={a.id} className="flex justify-between py-2.5 text-ink-soft">
                <Link href={`/${slug}/cobros/pagos/${a.paymentId}`} className="hover:text-brand">
                  Pago {a.code} · {METHOD_LABELS[a.method]} · {a.paidOn}
                </Link>
                <span className="tabular-nums">−{formatCOP(a.amount)}</span>
              </li>
            ))}
            <li className="flex justify-between py-2.5 text-base font-semibold">
              <span>Saldo</span>
              <span className={overdue ? "tabular-nums text-danger" : "tabular-nums"}>
                {formatCOP(balance)}
              </span>
            </li>
          </ul>
        </Card>
        <div className="space-y-4">
          {invoice.status !== "VOID" ? (
            <InvoiceActions
              slug={slug}
              invoiceId={invoice.id}
              balance={balance}
              canAdmin={canManageSettings(roles)}
              canRegenerate={Boolean(invoice.period) && invoice.paid === 0}
            />
          ) : (
            <Tile className="text-sm text-ink-soft">Las cuentas anuladas no se pueden modificar.</Tile>
          )}
        </div>
      </div>
    </div>
  );
}
