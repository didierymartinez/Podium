import type { Metadata } from "next";
import { db } from "@/db/client";
import { listFeePlans } from "@/modules/billing/fee-plans";
import { readBillingPolicy } from "@/modules/billing/policy";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { BillingPolicyForm } from "./billing-policy-form";
import { FeePlansCard } from "./fee-plans-card";
import { ConceptsCard } from "./concepts-card";
import { WompiCard } from "./wompi-card";
import { listConcepts } from "@/modules/billing/concepts";
import { paymentAccountStatus } from "@/modules/billing/online";
import { headers } from "next/headers";
import { EInvoiceCard } from "./einvoice-card";
import { getAccount, recentEInvoices } from "@/modules/einvoicing/einvoicing";

export const metadata: Metadata = { title: "Cobros" };

export default async function BillingSettingsPage({ params }: PageProps<"/[slug]/configuracion/cobros">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  const canEdit = canManageSettings(roles);
  const [plans, concepts, account, einvoiceAccount, einvoiceList] = await Promise.all([
    listFeePlans(db, school.id),
    listConcepts(db, school.id),
    paymentAccountStatus(db, school.id),
    getAccount(db, school.id),
    recentEInvoices(db, school.id, 10),
  ]);
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const activeByAmount = plans
    .filter((p) => p.active)
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
    .map(({ name, monthlyAmount }) => ({ name, monthlyAmount }));

  return (
    <div className="space-y-4">
      <FeePlansCard
        slug={slug}
        canEdit={canEdit}
        plans={plans.map(({ id, name, description, monthlyAmount, active }) => ({
          id,
          name,
          description,
          monthlyAmount,
          active,
        }))}
      />
      <WompiCard
        slug={slug}
        canEdit={canEdit}
        account={account}
        webhookUrl={`${origin}/api/webhooks/wompi/${slug}`}
      />
      <EInvoiceCard
        slug={slug}
        canEdit={canEdit}
        account={
          einvoiceAccount && {
            username: einvoiceAccount.username,
            itemId: einvoiceAccount.itemId,
            enabled: einvoiceAccount.enabled,
            verifiedAt: einvoiceAccount.verifiedAt?.toISOString() ?? null,
          }
        }
        recent={einvoiceList.map(({ e, code }) => ({
          code,
          status: e.status,
          number: e.number,
          error: e.error,
        }))}
      />
      <ConceptsCard
        slug={slug}
        canEdit={canEdit}
        concepts={concepts.map(({ id, name, defaultAmount, active }) => ({
          id,
          name,
          defaultAmount,
          active,
        }))}
      />
      <BillingPolicyForm
        slug={slug}
        canEdit={canEdit}
        initial={readBillingPolicy(school.settings.billing)}
        samplePlans={activeByAmount}
      />
    </div>
  );
}
