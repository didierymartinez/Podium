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
    </div>
  );
}
