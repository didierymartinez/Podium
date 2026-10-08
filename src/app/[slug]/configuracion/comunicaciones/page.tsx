import type { Metadata } from "next";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { CommsToggle } from "./comms-toggle";
import { WhatsAppNumberCard } from "./whatsapp-number-card";
import { db } from "@/db/client";
import { getSchoolNumber } from "@/modules/whatsapp/inbox";

export const metadata: Metadata = { title: "Comunicaciones" };

export default async function CommsSettingsPage({
  params,
}: PageProps<"/[slug]/configuracion/comunicaciones">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  const active = Boolean(school.commsEnabledAt);
  const number = await getSchoolNumber(db, school.id);
  return (
    <div className="space-y-4">
      <Card className="max-w-3xl">
        <SectionTitle
          action={
            active ? (
              <Chip tone="mint" dot>
                Activas
              </Chip>
            ) : (
              <Chip>Sin activar</Chip>
            )
          }
        >
          Comunicaciones con las familias
        </SectionTitle>
        <ul className="mb-5 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>
            Las familias reciben por push o correo los avisos, cuentas de cobro, recibos y cambios de clase.
          </li>
          <li>
            Las mensualidades se generan solas el día configurado y se envían recordatorios de pago (Ley
            2300).
          </li>
          <li>Mientras no las actives, todo queda solo dentro de la app y tu equipo sí recibe sus avisos.</li>
        </ul>
        <CommsToggle slug={slug} active={active} canEdit={canManageSettings(roles)} />
      </Card>
      <WhatsAppNumberCard slug={slug} canEdit={canManageSettings(roles)} account={number} />
    </div>
  );
}
