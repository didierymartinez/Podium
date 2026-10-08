import type { Metadata } from "next";
import { displayPhone } from "@/lib/phone";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Perfil de la escuela" };

export default async function ProfileSettingsPage({ params }: PageProps<"/[slug]/configuracion">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);

  return (
    <ProfileForm
      slug={slug}
      canEdit={canManageSettings(roles)}
      initial={{
        name: school.name,
        legalName: school.legalName ?? "",
        documentType: school.documentType ?? "",
        documentNumber: school.documentNumber ?? "",
        phone: displayPhone(school.phone),
        contactEmail: school.contactEmail ?? "",
        city: school.city,
        address: school.address ?? "",
        brandColor: school.brandColor,
      }}
    />
  );
}
