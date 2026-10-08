import type { Metadata } from "next";
import { db } from "@/db/client";
import { canManageSettings } from "@/modules/schools/permissions";
import { listVenues } from "@/modules/schools/venues";
import { getSchoolContext } from "../../data";
import { VenuesCard } from "./venues-card";

export const metadata: Metadata = { title: "Sedes" };

/** Sedes de la escuela (ADM-08). */
export default async function VenuesPage({ params }: PageProps<"/[slug]/configuracion/sedes">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  const venues = await listVenues(db, school.id);
  return (
    <VenuesCard
      slug={slug}
      canEdit={canManageSettings(roles)}
      venues={venues.map((v) => ({
        id: v.id,
        name: v.name,
        address: v.address ?? "",
        mapUrl: v.mapUrl ?? "",
        active: v.active,
        groups: v.groups,
      }))}
    />
  );
}
