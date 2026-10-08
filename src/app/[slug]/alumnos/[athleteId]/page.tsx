import { Cake, HeartPulse, IdCard, Pencil, Phone, School } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, Chip, SectionTitle, Tile, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { formatLongDate, todayIn } from "@/lib/dates";
import { displayPhone } from "@/lib/phone";
import { getAthlete } from "@/modules/athletes/athletes";
import { listAthleteDocuments } from "@/modules/documents/documents";
import { attendanceStats } from "@/modules/attendance/attendance";
import { athleteBillingStatus } from "@/modules/billing/statement";
import { formatCOP } from "@/lib/money";
import { addDays } from "@/lib/dates";
import { fileHref } from "@/modules/files/files";
import { invitationStates } from "@/modules/invitations/invitations";
import { ageOn } from "@/modules/athletes/enrollment-status";
import { DOCUMENT_TYPE_LABELS, RELATIONSHIP_LABELS } from "@/modules/athletes/schemas";
import { findAgeCategory, sportsAge } from "@/modules/schools/age-category";
import { canManagePeople, canViewHealthData } from "@/modules/schools/permissions";
import { getSportsStructure } from "@/modules/schools/queries";
import { getSchoolContext } from "../../data";
import { listInjuries } from "@/modules/attendance/injuries";
import { loadEnrollmentOptions } from "../options";
import { EnrollmentCard } from "./enrollment-card";
import { DocumentsCard } from "./documents-card";
import { InjuriesCard } from "./injuries-card";
import { PerformanceCard, toProgressView } from "@/components/performance-card";
import { athleteProgress } from "@/modules/sports/performances";
import { EvaluationsCard, toEvaluationsView } from "@/components/evaluations-card";
import { athleteEvaluations } from "@/modules/sports/evaluations";
import { GuardiansCard } from "./guardians-card";
import { PhotoEditor } from "./photo-editor";

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
  const [documents, stats, billing, injuries, progress, evaluations] = await Promise.all([
    listAthleteDocuments(db, school.id, athleteId, today),
    attendanceStats(db, school.id, [athleteId], { from: addDays(today, -30), to: today }),
    athleteBillingStatus(db, school.id, [athleteId], today),
    listInjuries(db, school.id, athleteId),
    athleteProgress(db, school.id, athleteId, todayIn(school.timezone)),
    athleteEvaluations(db, school.id, athleteId),
  ]);
  const debt = billing.get(athleteId);
  const attendance = stats.get(athleteId);
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
            <PhotoEditor
              slug={slug}
              athleteId={athleteId}
              name={name}
              photoUrl={athlete.photoFileId ? fileHref(slug, athlete.photoFileId) : null}
            />
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
        {debt && debt.balance > 0 ? (
          <Chip tone={debt.overdue ? "danger" : "sun"} dot>
            {debt.overdue ? "En mora" : "Saldo pendiente"} {formatCOP(debt.balance)}
          </Chip>
        ) : (
          <Chip tone="mint" dot>
            Al día
          </Chip>
        )}
        {attendance && attendance.rate !== null && (
          <Chip tone={attendance.rate >= 80 ? "mint" : attendance.rate >= 50 ? "sun" : "danger"}>
            Asistencia 30 días: {attendance.rate} % ({attendance.present + attendance.late}/
            {attendance.present + attendance.late + attendance.absent})
          </Chip>
        )}
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
                discountPercent: e.discountPercent,
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
          <EvaluationsCard slug={slug} {...toEvaluationsView(evaluations)} />
          <PerformanceCard tests={toProgressView(progress)} />
          <InjuriesCard
            slug={slug}
            athleteId={athleteId}
            today={today}
            injuries={injuries.map((i) => ({
              id: i.id,
              kind: i.kind,
              occurredOn: i.occurredOn,
              restriction: i.restriction,
              clearedOn: i.clearedOn,
              active: !i.clearedOn || i.clearedOn > today,
            }))}
          />
          <DocumentsCard
            slug={slug}
            athleteId={athleteId}
            today={today}
            imageConsent={athlete.imageConsent}
            rows={documents.map((d) => ({
              typeId: d.type.id,
              name: d.type.name,
              required: d.type.required,
              validityMonths: d.type.validityMonths,
              status: d.status,
              document: d.document && {
                id: d.document.id,
                issuedOn: d.document.issuedOn,
                expiresOn: d.document.expiresOn,
                notes: d.document.notes,
                fileUrl: d.document.fileId ? fileHref(slug, d.document.fileId) : null,
              },
            }))}
          />
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
