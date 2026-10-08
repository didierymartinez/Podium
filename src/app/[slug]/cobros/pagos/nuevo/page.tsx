import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { listGuardians } from "@/modules/athletes/guardians";
import { listInvoices } from "@/modules/billing/invoices";
import { balanceOf } from "@/modules/billing/ledger";
import { getSchoolContext } from "../../../data";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Registrar pago" };

export default async function NewPaymentPage({
  params,
  searchParams,
}: PageProps<"/[slug]/cobros/pagos/nuevo">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { school } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const [guardians, open] = await Promise.all([
    listGuardians(db, school.id),
    listInvoices(db, school.id, { status: "open", today }),
  ]);
  const guardianId = typeof sp.acudiente === "string" ? sp.acudiente : "";
  const invoiceId = typeof sp.cuenta === "string" ? sp.cuenta : "";

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/cobros/pagos`, label: "Pagos" }}
        title="Registrar pago"
        subtitle="Efectivo, transferencia, consignación o datáfono. Genera el recibo de caja."
      />
      <PaymentForm
        slug={slug}
        today={today}
        initialGuardianId={guardians.some((g) => g.id === guardianId) ? guardianId : ""}
        initialInvoiceId={invoiceId}
        guardians={guardians.map((g) => ({
          id: g.id,
          name: `${g.firstName} ${g.lastName}`,
          athletes: g.athletes.map((a) => a.name).join(", "),
        }))}
        invoices={open
          .slice()
          .reverse()
          .map((i) => ({
            id: i.id,
            guardianId: i.guardianId,
            code: i.code,
            dueOn: i.dueOn,
            balance: balanceOf(i),
            period: i.period,
          }))}
      />
    </div>
  );
}
