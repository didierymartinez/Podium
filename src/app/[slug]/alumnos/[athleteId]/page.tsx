import { Cake, HeartPulse, IdCard, Pencil, Phone, School } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Avatar, Card, Chip, SectionTitle, Tile, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { formatLongDate, todayIn } from "@/lib/dates";
import { displayPhone } from "@/lib/phone";
import { getAthlete } from "@/modules/athletes/athletes";
import { invitationStates } from "@/modules/invitations/invitations";
import { ageOn } from "@/modules/athletes/enrollment-status";
import { DOCUMENT_TYPE_LABELS, RELATIONSHIP_LABELS } from "@/modules/athletes/schemas";
import { findAgeCategory, sportsAge } from "@/modules/schools/age-category";
import { canManagePeople, canViewHealthData } from "@/modules/schools/permissions";
import { getSportsStructure } from "@/modules/schools/queries";
import { getSchoolContext } from "../../data";
import { loadEnrollmentOptions } from "../options";
import { EnrollmentCard } from "./enrollment-card";
import { GuardiansCard } from "./guardians-card";

export const metadata: Metadata = { title: "Alumno" };

export default async function AthletePage({ params }: PageProps<"/[slug]/alumnos/[athleteId]">) {
  const { slug, athleteId } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/.test(athleteId)) notFound();

  const [detail, structure, options] = await Promise.all([
    getAthlete(db, school.id, athleteId),
    getSportsStructure(db, school.id),
    loadEnrollmentOptions(school),
  ]);
  if (!detail) notFound();
  const { athlete, guardians, enrollments } = detail;
  const invitations = await invitationStates(
    db,
    school.id,
    "GUARDIAN",
    guardians.map(({ guardian }) => ({ id: guardian.id, userId: guardian.userId })),
  );
  const name = `${athlete.firstName} ${athlete.lastName}`;
  const today = todayIn(school.timezone);
  const age = ageOn(athlete.birthDate, today);
  const category = findAgeCategory(
    sportsAge(athlete.birthDate, Number(today.slice(0, 4))),
    structure.ageCategories,
  );
  const current = enrollments.find((e) => e.enrollment.status === "ACTIVE");

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: `/${slug}/alumnos`, label: "Alumnos" }}
        title={
          <span className="flex items-center gap-4">
            <Avatar name={name} size={56} />
            {name}
          </span>
        }
        actions={
          <Link href={`/${slug}/alumnos/${athleteId}/editar`} className={buttonClass("secondary", "h-10")}>
            <Pencil className="size-4" /> Editar datos
          </Link>
        }
      />
      <div className="flex flex-wrap gap-2 px-1">
        <Chip tone="brand">{age} años</Chip>
        {category && <Chip tone="violet">Categoría {category.name}</Chip>}
        {current ? (
          <Chip tone="mint" dot>
            {current.groupName}
          </Chip>
        ) : (
          <Chip dot>Sin matrícula activa</Chip>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <EnrollmentCard
            slug={slug}
            athleteId={athleteId}
            options={options}
            enrollments={enrollments.map(
              ({ enrollment: e, groupName, groupColor, feePlanName, monthlyAmount }) => ({
                id: e.id,
                status: e.status,
                groupName,
                groupColor,
                feePlanName,
                monthlyAmount,
                startDate: e.startDate,
                endDate: e.endDate,
                frozenUntil: e.frozenUntil,
                withdrawalReason: e.withdrawalReason,
              }),
            )}
          />
          <GuardiansCard
            slug={slug}
            athleteId={athleteId}
            athleteFirstName={athlete.firstName}
            guardians={guardians.map(({ guardian: g, relationship, isPayer }) => ({
              id: g.id,
              invitation: invitations.get(g.id) ?? "none",
              name: `${g.firstName} ${g.lastName}`,
              phone: g.phone,
              displayPhone: displayPhone(g.phone),
              email: g.email,
              relationship: RELATIONSHIP_LABELS[relationship],
              isPayer,
            }))}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <SectionTitle>Datos personales</SectionTitle>
            <ul className="space-y-3 text-sm">
              <Info
                icon={<Cake className="size-4" />}
                label="Nacimiento"
                value={formatLongDate(athlete.birthDate)}
              />
              <Info
                icon={<IdCard className="size-4" />}
                label="Documento"
                value={
                  athlete.documentNumber && athlete.documentType
                    ? `${DOCUMENT_TYPE_LABELS[athlete.documentType]} ${athlete.documentNumber}`
                    : "Sin documento"
                }
              />
              {athlete.phone && (
                <Info
                  icon={<Phone className="size-4" />}
                  label="Celular"
                  value={displayPhone(athlete.phone)}
                />
              )}
              {athlete.schoolName && (
                <Info icon={<School className="size-4" />} label="Colegio" value={athlete.schoolName} />
              )}
            </ul>
          </Card>

          {canViewHealthData(roles) && (
            <Card>
              <SectionTitle action={<Chip tone="danger">Confidencial</Chip>}>Salud</SectionTitle>
              <ul className="space-y-3 text-sm">
                <Info
                  icon={<HeartPulse className="size-4" />}
                  label="EPS"
                  value={athlete.healthInsurer ?? "Sin dato"}
                />
                <Info
                  icon={<HeartPulse className="size-4" />}
                  label="RH"
                  value={athlete.bloodType ?? "Sin dato"}
                />
                <Info
                  icon={<Phone className="size-4" />}
                  label="Emergencia"
                  value={
                    athlete.emergencyContactName || athlete.emergencyContactPhone
                      ? [athlete.emergencyContactName, displayPhone(athlete.emergencyContactPhone)]
                          .filter(Boolean)
                          .join(" · ")
                      : "Sin dato"
                  }
                />
              </ul>
              {athlete.medicalNotes && (
                <Tile className="mt-4 whitespace-pre-line bg-danger/5 text-sm">{athlete.medicalNotes}</Tile>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 text-ink-faint">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-ink-soft">{label}</span>
        <span className="block font-medium">{value}</span>
      </span>
    </li>
  );
}
