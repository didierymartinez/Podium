import type { Metadata } from "next";
import { displayPhone } from "@/lib/phone";
import { fileHref } from "@/modules/files/files";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";
import { ProfileForm } from "./profile-form";
import { SignupCard } from "./signup-card";
import { appUrl } from "../../deliver";
import { readSignupSettings } from "@/modules/signup/public-signup";

export const metadata: Metadata = { title: "Perfil de la escuela" };

export default async function ProfileSettingsPage({ params }: PageProps<"/[slug]/configuracion">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);

  const signup = readSignupSettings(school.settings.signup);
  return (
    <div className="space-y-4">
      <ProfileForm
        slug={slug}
        canEdit={canManageSettings(roles)}
        logoUrl={school.logoFileId ? fileHref(slug, school.logoFileId) : null}
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
      <SignupCard
        slug={slug}
        canEdit={canManageSettings(roles)}
        enabled={signup.enabled}
        intro={signup.intro}
        link={new URL(`/inscripcion/${slug}`, appUrl()).toString()}
      />
    </div>
  );
}
