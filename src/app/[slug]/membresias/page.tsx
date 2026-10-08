import type { Metadata } from "next";
import QRCode from "qrcode";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { checkInToken } from "@/modules/attendance/check-in";
import { listMembers, listPlans } from "@/modules/gym/memberships";
import { canManagePeople } from "@/modules/schools/permissions";
import { appUrl } from "../../deliver";
import { getSchoolContext } from "../data";
import { MemberForm, PlanForm, ReceptionCheckIn, SellMembership } from "./forms";

export const metadata: Metadata = { title: "Membresías" };

/** Gimnasio: socios, membresías, ingresos y retención (EVALUACION_GIMNASIOS §6). */
export default async function MembershipsPage({ params }: PageProps<"/[slug]/membresias">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const today = todayIn(school.timezone);
  const [members, plans] = await Promise.all([listMembers(db, school.id, today), listPlans(db, school.id)]);
  const activePlans = plans
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: `${p.name} · ${formatCOP(p.price)}` }));
  const selfUrl = new URL(
    `/${slug}/ingreso?t=${checkInToken(serverEnv().SESSION_SECRET, `gym:${school.id}`)}`,
    appUrl(),
  ).toString();
  const qr = await QRCode.toString(selfUrl, { type: "svg", margin: 1, width: 200 });
  const expiring = members.filter((m) => m.expiring);
  const inactive = members.filter((m) => m.inactive);

  return (
    <div className="space-y-4">
      <PageHeader title="Membresías" subtitle="Socios, planes, ingresos y retención" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <ReceptionCheckIn slug={slug} members={members.map((m) => ({ id: m.id, name: m.name }))} />
          <Card>
            <SectionTitle>Socios</SectionTitle>
            <ul className="divide-y divide-line text-sm" aria-label="Socios">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-40 flex-1">
                    <span className="font-semibold">{m.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {m.current
                        ? `${m.current.planName} · vence ${m.current.endsOn}${m.current.visitsLeft !== null ? ` · ${m.current.visitsLeft} visitas` : ""}`
                        : "Sin membresía vigente"}
                      {m.lastCheckIn ? ` · último ingreso ${m.lastCheckIn}` : ""}
                    </span>
                  </span>
                  {m.expiring && <Chip tone="sun">Por vencer</Chip>}
                  {m.inactive && <Chip tone="danger">Inactivo</Chip>}
                  <SellMembership slug={slug} athleteId={m.id} name={m.name} plans={activePlans} />
                </li>
              ))}
              {members.length === 0 && (
                <li className="py-2 text-ink-soft">Aún no hay socios con membresía.</li>
              )}
            </ul>
          </Card>
          <Card aria-label="Retención">
            <SectionTitle>Retención</SectionTitle>
            <p className="text-sm font-semibold">Por vencer en 7 días</p>
            <p className="mb-2 text-sm text-ink-soft">{expiring.map((m) => m.name).join(", ") || "Nadie."}</p>
            <p className="text-sm font-semibold">Sin venir hace 10 días o más</p>
            <p className="text-sm text-ink-soft">{inactive.map((m) => m.name).join(", ") || "Nadie."}</p>
          </Card>
        </div>
        <div className="space-y-4">
          <MemberForm slug={slug} />
          <PlanForm
            slug={slug}
            plans={plans.map((p) => ({
              id: p.id,
              name: p.name,
              kind: p.kind,
              days: p.days,
              visits: p.visits,
              price: p.price,
            }))}
          />
          <Card className="text-center text-sm" aria-label="QR de ingreso">
            <SectionTitle>QR de ingreso</SectionTitle>
            <div
              className="mx-auto w-52 rounded-2xl bg-white p-2"
              role="img"
              aria-label="Código QR del gimnasio"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <p className="mt-2 text-ink-soft">
              Imprímelo en recepción: el socio lo escanea y queda registrado su ingreso.
            </p>
            <a href={selfUrl} className="break-all text-xs text-brand" aria-label="Link de ingreso">
              {selfUrl}
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}
