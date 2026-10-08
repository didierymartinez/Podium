import type { Metadata } from "next";
import { db } from "@/db/client";
import { listDocumentTypes } from "@/modules/documents/documents";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { DocumentTypesCard } from "./document-types-card";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentSettingsPage({
  params,
}: PageProps<"/[slug]/configuracion/documentos">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  const types = await listDocumentTypes(db, school.id);
  return (
    <DocumentTypesCard
      slug={slug}
      canEdit={canManageSettings(roles)}
      types={types.map(({ id, name, required, validityMonths, active }) => ({
        id,
        name,
        required,
        validityMonths,
        active,
      }))}
    />
  );
}
