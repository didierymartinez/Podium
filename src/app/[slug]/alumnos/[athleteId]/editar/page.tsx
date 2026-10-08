import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { displayPhone } from "@/lib/phone";
import { getAthlete } from "@/modules/athletes/athletes";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../../data";
import { EditAthleteForm } from "./edit-athlete-form";

export const metadata: Metadata = { title: "Editar alumno" };

export default async function EditAthletePage({ params }: PageProps<"/[slug]/alumnos/[athleteId]/editar">) {
  const { slug, athleteId } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/.test(athleteId)) notFound();
  const detail = await getAthlete(db, school.id, athleteId);
  if (!detail) notFound();
  const a = detail.athlete;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={`${a.firstName} ${a.lastName}`}
        subtitle="Editar datos"
        back={{ href: `/${slug}/alumnos/${athleteId}`, label: "Ficha del alumno" }}
      />
      <EditAthleteForm
        slug={slug}
        athleteId={athleteId}
        initial={{
          firstName: a.firstName,
          lastName: a.lastName,
          documentType: a.documentType ?? "TI",
          documentNumber: a.documentNumber ?? "",
          birthDate: a.birthDate,
          sex: a.sex ?? "",
          phone: displayPhone(a.phone),
          email: a.email ?? "",
          healthInsurer: a.healthInsurer ?? "",
          bloodType: a.bloodType ?? "",
          medicalNotes: a.medicalNotes ?? "",
          emergencyContactName: a.emergencyContactName ?? "",
          emergencyContactPhone: displayPhone(a.emergencyContactPhone),
          schoolName: a.schoolName ?? "",
          notes: a.notes ?? "",
        }}
      />
    </div>
  );
}
