import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { addDays, todayIn } from "@/lib/dates";
import { listConcepts } from "@/modules/billing/concepts";
import { currentMembers, listGroups } from "@/modules/groups/groups";
import { getSchoolContext } from "../../data";
import { OneTimeChargeForm } from "./one-time-charge-form";

export const metadata: Metadata = { title: "Cobro único" };

export default async function OneTimeChargePage({ params }: PageProps<"/[slug]/cobros/cobro-unico">) {
  const { slug } = await params;
  const { school } = await getSchoolContext(slug);
  const [concepts, groups, members] = await Promise.all([
    listConcepts(db, school.id),
    listGroups(db, school.id),
    currentMembers(db, school.id),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/cobros`, label: "Cobros" }}
        title="Cobro único"
        subtitle="Uniformes, inscripciones a competencias, eventos o saldos anteriores. Una cuenta por responsable de pago."
      />
      <OneTimeChargeForm
        slug={slug}
        dueOn={addDays(todayIn(school.timezone), 7)}
        concepts={concepts
          .filter((c) => c.active)
          .map((c) => ({ id: c.id, name: c.name, amount: c.defaultAmount }))}
        groups={groups
          .filter((g) => g.active)
          .map((g) => ({ id: g.id, name: g.name, members: members.get(g.id) ?? [] }))}
      />
    </div>
  );
}
