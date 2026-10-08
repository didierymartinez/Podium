import { Download } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PushToggle } from "@/components/push-toggle";
import { Card, Chip, SectionTitle, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { users } from "@/db/schema";
import { isoDateOf } from "@/lib/dates";
import { readPreferences } from "@/modules/notifications/preferences";
import { getMemberHome } from "@/modules/portal/member-home";
import { CONSENT_LABELS, athleteConsents, listConsents } from "@/modules/portal/privacy";
import { eq } from "drizzle-orm";
import { getSchoolContext } from "../data";
import { ConfirmDataButton, ConsentToggles, DeletionRequest, PreferencesForm, ProfileForm } from "./forms";
import { pendingConfirmations } from "@/modules/athletes/reenrollment";

export const metadata: Metadata = { title: "Mis datos" };

export default async function MyDataPage({ params }: PageProps<"/[slug]/mis-datos">) {
  const { slug } = await params;
  const { school, user } = await getSchoolContext(slug);
  const [[row], consents, home] = await Promise.all([
    db.select().from(users).where(eq(users.id, user.id)),
    listConsents(db, school.id, user.id),
    asPortalUser(user.id, () => getMemberHome(db, school.id, user.id)),
  ]);
  const whatsapp = consents.some(
    (c) => c.schoolId === school.id && c.document === "WHATSAPP" && !c.revokedAt,
  );
  const pendingReenrollment = await asPortalUser(user.id, () => pendingConfirmations(db, school.id));
  const kids = await asPortalUser(user.id, () =>
    athleteConsents(
      db,
      school.id,
      home.athletes.map((a) => a.id),
    ),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mis datos"
        subtitle="Tu información, tus autorizaciones y qué avisos quieres recibir."
      />
      {pendingReenrollment.length > 0 && (
        <Card className="border-brand/30 bg-brand/5" aria-label="Re-matrícula">
          <SectionTitle>Re-matrícula {pendingReenrollment[0].year}</SectionTitle>
          <p className="mb-3 text-sm">
            Revisa tu perfil y los datos de{" "}
            {[...new Set(pendingReenrollment.map((p) => p.firstName))].join(", ")}. Si algo cambió,
            actualízalo aquí o avísale a la escuela; luego confirma.
          </p>
          <ConfirmDataButton slug={slug} />
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Perfil</SectionTitle>
          <ProfileForm slug={slug} initial={{ name: row.name, phone: row.phone ?? "" }} email={row.email} />
        </Card>
        <Card>
          <SectionTitle>Notificaciones</SectionTitle>
          <PreferencesForm slug={slug} initial={readPreferences(row.notificationPrefs)} />
          <div className="mt-4 border-t border-line pt-4">
            <PushToggle slug={slug} />
          </div>
        </Card>
        <Card>
          <SectionTitle>Autorizaciones</SectionTitle>
          <ul className="mb-4 space-y-1.5 text-sm" aria-label="Autorizaciones otorgadas">
            {consents.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">{CONSENT_LABELS[c.document] ?? c.document}</span>
                <span className="text-xs text-ink-soft">{isoDateOf(c.acceptedAt, school.timezone)}</span>
                {c.revokedAt ? <Chip>Revocada</Chip> : <Chip tone="mint">Vigente</Chip>}
              </li>
            ))}
          </ul>
          <ConsentToggles
            slug={slug}
            whatsapp={whatsapp}
            kids={kids.map((k) => ({ id: k.id, name: k.firstName, imageConsent: k.imageConsent }))}
          />
        </Card>
        <Card>
          <SectionTitle>Tus derechos (Ley 1581)</SectionTitle>
          <p className="mb-3 text-sm text-ink-soft">
            Puedes conocer, actualizar y pedir que se eliminen tus datos. {school.name} es responsable del
            tratamiento de los datos de la escuela; Podium es el encargado.
          </p>
          <a
            href={`/api/mis-datos?escuela=${encodeURIComponent(slug)}`}
            className={buttonClass("secondary", "h-10")}
          >
            <Download className="size-4" /> Descargar mis datos
          </a>
          <div className="mt-4 border-t border-line pt-4">
            <DeletionRequest slug={slug} />
          </div>
        </Card>
      </div>
    </div>
  );
}
