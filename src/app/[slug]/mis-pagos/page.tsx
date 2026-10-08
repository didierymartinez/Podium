import { Clock, Download } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Alert, Card, Chip, SectionTitle, Tile, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { listInvoices, periodLabel } from "@/modules/billing/invoices";
import { INVOICE_STATUS, METHOD_LABELS, pdfHref } from "@/modules/billing/labels";
import { balanceOf } from "@/modules/billing/ledger";
import { intentByReference, paymentAccountStatus, pendingIntents } from "@/modules/billing/online";
import { listPayments } from "@/modules/billing/payments";
import { guardianStatement } from "@/modules/billing/statement";
import { guardianIdsOfUser } from "@/modules/portal/family";
import { getSchoolContext } from "../data";
import { PayOnline } from "./pay-online";

export const metadata: Metadata = { title: "Mis pagos" };

export default async function MyPaymentsPage({ params, searchParams }: PageProps<"/[slug]/mis-pagos">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { school, user } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const [guardianId] = await guardianIdsOfUser(db, school.id, user.id);
  if (!guardianId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Mis pagos" />
        <Card className="text-center text-sm text-ink-soft">
          Aquí verán sus cobros y pagos los acudientes responsables de pago.
        </Card>
      </div>
    );
  }
  const [invoices, payments, statement, intents, account] = await Promise.all([
    listInvoices(db, school.id, { guardianId, today }),
    listPayments(db, school.id, { guardianId }),
    guardianStatement(db, school.id, guardianId),
    pendingIntents(db, school.id, [guardianId]),
    paymentAccountStatus(db, school.id),
  ]);
  const returned = typeof sp.ref === "string" ? await intentByReference(db, school.id, sp.ref) : null;
  const open = invoices.filter((i) => i.status === "PENDING" || i.status === "PARTIAL");
  const closed = invoices.filter((i) => i.status === "PAID").slice(0, 12);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mis pagos"
        subtitle={school.name}
        actions={
          <>
            <a
              href={pdfHref(slug, "estado", guardianId)}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary", "h-10")}
            >
              <Download className="size-4" /> Estado de cuenta
            </a>
            {statement && statement.owed === 0 && (
              <a
                href={pdfHref(slug, "paz-y-salvo", guardianId)}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary", "h-10")}
              >
                <Download className="size-4" /> Paz y salvo
              </a>
            )}
          </>
        }
      />
      {returned && returned.status === "APPROVED" && (
        <Alert tone="info">¡Pago aprobado! Gracias. Ya quedó aplicado.</Alert>
      )}
      {returned && (returned.status === "DECLINED" || returned.status === "ERROR") && (
        <Alert>El pago no fue aprobado. Puedes intentar de nuevo.</Alert>
      )}
      {intents.length > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-2xl bg-sun/30 px-4 py-3 text-sm">
          <Clock className="size-4 shrink-0" />
          <span>
            <strong>Pago en verificación</strong> ({formatCOP(intents.reduce((s, i) => s + i.amount, 0))}). Lo
            confirmamos apenas Wompi nos avise.
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-ink-soft">Saldo pendiente</p>
          <p
            className={
              statement && statement.owed > 0
                ? "mt-1 text-2xl font-semibold text-danger"
                : "mt-1 text-2xl font-semibold"
            }
          >
            {formatCOP(statement?.owed ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-soft">Saldo a favor</p>
          <p className="mt-1 text-2xl font-semibold">{formatCOP(statement?.credit ?? 0)}</p>
        </Card>
      </div>

      <Card>
        <SectionTitle>Por pagar</SectionTitle>
        {open.length === 0 ? (
          <Tile className="text-sm text-ink-soft">Estás al día. ¡Gracias!</Tile>
        ) : (
          <PayOnline
            slug={slug}
            online={Boolean(account)}
            invoices={open.map((i) => ({
              id: i.id,
              code: i.code,
              label: i.period ? `Mensualidad de ${periodLabel(i.period)}` : "Cobro único",
              dueOn: i.dueOn,
              balance: balanceOf(i),
              overdue: i.dueOn < today,
              pdf: pdfHref(slug, "cuenta", i.id),
            }))}
          />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Pagos realizados</SectionTitle>
          <ul className="divide-y divide-line text-sm" aria-label="Pagos realizados">
            {payments
              .filter((p) => p.status === "CONFIRMED")
              .map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1">
                    {p.code} · {p.paidOn} · {METHOD_LABELS[p.method]}
                  </span>
                  <span className="font-semibold tabular-nums">{formatCOP(p.amount)}</span>
                  <a
                    href={pdfHref(slug, "recibo", p.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand"
                    aria-label={`Recibo ${p.code}`}
                  >
                    <Download className="size-4" />
                  </a>
                </li>
              ))}
            {payments.length === 0 && <li className="py-2 text-ink-soft">Aún no hay pagos.</li>}
          </ul>
        </Card>
        <Card>
          <SectionTitle>Cuentas pagadas</SectionTitle>
          <ul className="divide-y divide-line text-sm">
            {closed.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <span className="flex-1">
                  {i.code} · {i.period ? periodLabel(i.period) : "Cobro único"}
                </span>
                <Chip tone={INVOICE_STATUS.PAID.tone}>Pagada</Chip>
                <a
                  href={pdfHref(slug, "cuenta", i.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand"
                  aria-label={`Cuenta ${i.code}`}
                >
                  <Download className="size-4" />
                </a>
              </li>
            ))}
            {closed.length === 0 && <li className="py-2 text-ink-soft">—</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
