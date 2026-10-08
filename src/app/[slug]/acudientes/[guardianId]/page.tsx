import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Avatar, Card, Chip, SectionTitle, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { displayPhone } from "@/lib/phone";
import { whatsappLink } from "@/lib/whatsapp";
import { getGuardian } from "@/modules/athletes/guardians";
import { RELATIONSHIP_LABELS } from "@/modules/athletes/schemas";
import { InvitationChip } from "@/modules/invitations/components/invitation-chip";
import { InviteButton } from "@/modules/invitations/components/invite-button";
import { invitationStates } from "@/modules/invitations/invitations";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { GuardianForm } from "./guardian-form";
import { guardianStatement } from "@/modules/billing/statement";
import { StatementCard } from "./statement-card";
import { CollectionNotesCard, PaymentPlanCard } from "./collection-cards";
import { getActivePaymentPlan, listCollectionNotes } from "@/modules/billing/collections";
import { isoDateOf, todayIn } from "@/lib/dates";
import { receivedAnnouncements } from "@/modules/announcements/announcements";

export const metadata: Metadata = { title: "Acudiente" };

export default async function GuardianPage({ params }: PageProps<"/[slug]/acudientes/[guardianId]">) {
  const { slug, guardianId } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/.test(guardianId)) notFound();
  const detail = await getGuardian(db, school.id, guardianId);
  if (!detail) notFound();
  const { guardian, athletes } = detail;
  const name = `${guardian.firstName} ${guardian.lastName}`;
  const invitation =
    (await invitationStates(db, school.id, "GUARDIAN", [guardian])).get(guardian.id) ?? "none";
  const today = todayIn(school.timezone);
  const [statement, received, notes, plan] = await Promise.all([
    guardianStatement(db, school.id, guardian.id),
    receivedAnnouncements(db, school.id, { guardianId: guardian.id }),
    listCollectionNotes(db, school.id, guardian.id),
    getActivePaymentPlan(db, school.id, guardian.id, today),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: `/${slug}/acudientes`, label: "Acudientes" }}
        title={
          <span className="flex items-center gap-4">
            <Avatar name={name} size={56} />
            {name}
          </span>
        }
        actions={
          <>
            {invitation !== "account" && (
              <InviteButton
                slug={slug}
                target={{ role: "GUARDIAN", guardianId: guardian.id }}
                resend={invitation !== "none"}
              />
            )}
            <a
              href={whatsappLink(guardian.phone)}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary", "h-10")}
            >
              <MessageCircle className="size-4 text-mint" /> WhatsApp
            </a>
          </>
        }
      />
      <div className="flex flex-wrap gap-2 px-1">
        <InvitationChip state={invitation} />
        <Chip tone="brand">{displayPhone(guardian.phone)}</Chip>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <GuardianForm
          slug={slug}
          guardianId={guardian.id}
          initial={{
            firstName: guardian.firstName,
            lastName: guardian.lastName,
            documentType: guardian.documentType ?? "CC",
            documentNumber: guardian.documentNumber ?? "",
            phone: displayPhone(guardian.phone),
            email: guardian.email ?? "",
          }}
        />
        <Card>
          <SectionTitle>Alumnos a cargo</SectionTitle>
          <ul className="space-y-2">
            {athletes.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/${slug}/alumnos/${a.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-canvas px-3 py-2 hover:bg-muted"
                >
                  <Avatar name={`${a.firstName} ${a.lastName}`} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {a.firstName} {a.lastName}
                    </span>
                    <span className="block text-xs text-ink-soft">{RELATIONSHIP_LABELS[a.relationship]}</span>
                  </span>
                  {a.isPayer && <Chip tone="violet">Paga</Chip>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {statement && <StatementCard slug={slug} guardianId={guardian.id} statement={statement} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <CollectionNotesCard
          slug={slug}
          guardianId={guardian.id}
          notes={notes.map((n) => ({
            id: n.id,
            kind: n.kind,
            note: n.note,
            date: isoDateOf(n.createdAt, school.timezone),
            promiseOn: n.promiseOn,
            promiseAmount: n.promiseAmount,
            promiseStatus: n.promiseStatus,
          }))}
        />
        <PaymentPlanCard
          slug={slug}
          guardianId={guardian.id}
          owed={statement?.owed ?? 0}
          today={today}
          plan={
            plan && {
              id: plan.plan.id,
              total: plan.plan.total,
              paid: plan.paid,
              installments: plan.installments.map((i) => ({
                position: i.position,
                dueOn: i.dueOn,
                amount: i.amount,
                state: i.state,
              })),
            }
          }
        />
      </div>
      <Card>
        <SectionTitle>Avisos recibidos</SectionTitle>
        <ul className="divide-y divide-line text-sm" aria-label="Avisos recibidos">
          {received.map(({ announcement: a }) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <Link href={`/${slug}/avisos/${a.id}`} className="flex-1 hover:text-brand">
                {a.title}
              </Link>
              <span className="text-xs text-ink-soft">{a.createdAt.toISOString().slice(0, 10)}</span>
            </li>
          ))}
          {received.length === 0 && <li className="py-2 text-ink-soft">Aún no ha recibido avisos.</li>}
        </ul>
      </Card>
    </div>
  );
}
