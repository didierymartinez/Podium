import type { Metadata } from "next";
import { db } from "@/db/client";
import { listFeePlans } from "@/modules/billing/fee-plans";
import { readBillingPolicy } from "@/modules/billing/policy";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { BillingPolicyForm } from "./billing-policy-form";
import { FeePlansCard } from "./fee-plans-card";

export const metadata: Metadata = { title: "Cobros" };

export default async function BillingSettingsPage({ params }: PageProps<"/[slug]/configuracion/cobros">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  const canEdit = canManageSettings(roles);
  const plans = await listFeePlans(db, school.id);
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
      <BillingPolicyForm
        slug={slug}
        canEdit={canEdit}
        initial={readBillingPolicy(school.settings.billing)}
        samplePlans={activeByAmount}
      />
    </div>
  );
}
