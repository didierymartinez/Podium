import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Alert, Avatar, Card, Chip, SectionTitle, Tile } from "@/components/ui";
import { db } from "@/db/client";
import { displayPhone } from "@/lib/phone";
import { getCoach } from "@/modules/coaches/coaches";
import { coachScheduleConflicts } from "@/modules/coaches/conflicts";
import { listGroups } from "@/modules/groups/groups";
import { describeSchedule } from "@/modules/groups/schedule";
import { InvitationChip } from "@/modules/invitations/components/invitation-chip";
import { InviteButton } from "@/modules/invitations/components/invite-button";
import { invitationStates } from "@/modules/invitations/invitations";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { CoachActiveButton } from "../coach-active-button";
import { CoachForm } from "../coach-form";

export const metadata: Metadata = { title: "Profesor" };

export default async function CoachPage({ params }: PageProps<"/[slug]/profesores/[coachId]">) {
  const { slug, coachId } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManageSettings(roles)) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/.test(coachId)) notFound();
  const [coach, groups] = await Promise.all([getCoach(db, school.id, coachId), listGroups(db, school.id)]);
  if (!coach) notFound();
  const name = `${coach.firstName} ${coach.lastName}`;
  const invitation = (await invitationStates(db, school.id, "COACH", [coach])).get(coach.id) ?? "none";
  const conflicts = coachScheduleConflicts(groups).filter((c) => c.coachId === coach.id);
  const coachGroups = groups.filter((g) => g.coaches.some((c) => c.id === coach.id));

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: `/${slug}/profesores`, label: "Profesores" }}
        title={
          <span className="flex items-center gap-4">
            <Avatar name={name} size={56} />
            {name}
          </span>
        }
        actions={
          <>
            <CoachActiveButton slug={slug} coachId={coach.id} active={coach.active} />
            {invitation !== "account" && (
              <InviteButton
                slug={slug}
                target={{ role: "COACH", coachId: coach.id }}
                resend={invitation !== "none"}
              />
            )}
          </>
        }
      />
      <div className="flex flex-wrap gap-2 px-1">
        <InvitationChip state={invitation} />
        {!coach.active && <Chip>Inactivo</Chip>}
        <Chip tone="brand">{displayPhone(coach.phone)}</Chip>
      </div>

      {conflicts.map((c) => (
        <Alert key={c.groupIds.join("-")}>
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="size-4" /> Cruce de horario: {c.description}.
          </span>
        </Alert>
      ))}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <CoachForm
          slug={slug}
          initial={{
            id: coach.id,
            firstName: coach.firstName,
            lastName: coach.lastName,
            documentType: coach.documentType ?? "CC",
            documentNumber: coach.documentNumber ?? "",
            phone: displayPhone(coach.phone),
            email: coach.email ?? "",
            specialty: coach.specialty ?? "",
            hiredOn: coach.hiredOn ?? "",
          }}
        />
        <Card>
          <SectionTitle>Grupos</SectionTitle>
          <ul className="space-y-2.5">
            {coachGroups.length === 0 && (
              <Tile className="text-sm text-ink-soft">
                Sin grupos. Asígnalo desde la edición de un{" "}
                <Link href={`/${slug}/grupos`} className="text-brand">
                  grupo
                </Link>
                .
              </Tile>
            )}
            {coachGroups.map((g) => (
              <li key={g.id}>
                <Link href={`/${slug}/grupos/${g.id}`}>
                  <Tile className="hover:border-brand/40">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: g.color }} aria-hidden />
                      <span className="flex-1 font-semibold">{g.name}</span>
                      <Chip
                        tone={g.coaches.find((c) => c.id === coach.id)?.role === "HEAD" ? "brand" : "neutral"}
                      >
                        {g.coaches.find((c) => c.id === coach.id)?.role === "HEAD" ? "Titular" : "Auxiliar"}
                      </Chip>
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">{describeSchedule(g.schedule)}</p>
                  </Tile>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
