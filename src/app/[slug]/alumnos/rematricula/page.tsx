import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { listCampaigns, previewCampaign } from "@/modules/athletes/reenrollment";
import { readBillingPolicy } from "@/modules/billing/policy";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { LaunchCampaignForm } from "./launch-form";

export const metadata: Metadata = { title: "Re-matrícula" };

export default async function ReenrollmentPage({ params }: PageProps<"/[slug]/alumnos/rematricula">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const today = todayIn(school.timezone);
  const [preview, campaigns] = await Promise.all([
    previewCampaign(db, school.id),
    listCampaigns(db, school.id),
  ]);
  const year = Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 10 ? 1 : 0);
  const policy = readBillingPolicy(school.settings.billing);
  const launched = new Set(campaigns.map((c) => c.campaign.year));

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/alumnos`, label: "Alumnos" }}
        title="Re-matrícula anual"
        subtitle="Cobra la matrícula del año y pide a las familias confirmar sus datos"
      />
      {!launched.has(year) && (
        <Card>
          <SectionTitle>Nueva campaña</SectionTitle>
          <p className="mb-3 text-sm text-ink-soft">
            {preview.length} alumnos con matrícula activa o congelada. Se genera una cuenta por familia (los
            hermanos van juntos) y se avisa para confirmar datos.
          </p>
          <LaunchCampaignForm slug={slug} year={year} amount={policy.enrollmentFee} dueOn={`${year}-01-31`} />
        </Card>
      )}
      {campaigns.map(({ campaign: c, athletes }) => {
        const paid = athletes.filter((a) => a.paid).length;
        const confirmed = athletes.filter((a) => a.confirmed).length;
        return (
          <Card key={c.id}>
            <SectionTitle
              action={
                <span className="flex gap-2">
                  <Chip tone="mint">
                    Pagaron {paid}/{athletes.length}
                  </Chip>
                  <Chip tone="brand">
                    Confirmaron {confirmed}/{athletes.length}
                  </Chip>
                </span>
              }
            >
              Re-matrícula {c.year} · {formatCOP(c.amount)}
            </SectionTitle>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2" aria-label={`Re-matrícula ${c.year}`}>
              {athletes.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-1.5">
                  <span className="flex-1">{a.name}</span>
                  {a.paid ? <Chip tone="mint">Pagó</Chip> : <Chip tone="sun">Pendiente</Chip>}
                  {a.confirmed ? <Chip tone="brand">Datos ok</Chip> : <Chip>Sin confirmar</Chip>}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
