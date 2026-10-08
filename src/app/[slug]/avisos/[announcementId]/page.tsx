import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Alert, Card, Chip } from "@/components/ui";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import {
  AUDIENCE_KINDS,
  getAnnouncement,
  receivedAnnouncements,
} from "@/modules/announcements/announcements";
import { guardianIdsOfUser } from "@/modules/portal/family";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { WhatsAppSender } from "./whatsapp-sender";

export const metadata: Metadata = { title: "Aviso" };

export default async function AnnouncementPage({ params }: PageProps<"/[slug]/avisos/[announcementId]">) {
  const { slug, announcementId } = await params;
  const { school, user, roles } = await getSchoolContext(slug);
  if (!/^[0-9a-f-]{36}$/.test(announcementId)) notFound();
  const staff = canManagePeople(roles) || roles.includes("COACH");

  if (!staff) {
    const mine = await asPortalUser(user.id, async () => {
      const [guardianId] = await guardianIdsOfUser(db, school.id, user.id);
      return (await receivedAnnouncements(db, school.id, { guardianId, userId: user.id })).find(
        (r) => r.announcement.id === announcementId,
      );
    });
    if (!mine) notFound();
    return (
      <div className="space-y-4">
        <PageHeader back={{ href: `/${slug}/avisos`, label: "Avisos" }} title={mine.announcement.title} />
        <Card className="whitespace-pre-line">{mine.message}</Card>
      </div>
    );
  }

  const data = await getAnnouncement(db, school.id, announcementId);
  if (!data) notFound();
  const { announcement: a, recipients } = data;
  if (!canManagePeople(roles) && a.authorUserId !== user.id) notFound();
  const withAccount = recipients.filter((r) => r.userId).length;

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/avisos`, label: "Avisos" }}
        title={a.title}
        subtitle={`${AUDIENCE_KINDS[a.audience.kind as keyof typeof AUDIENCE_KINDS] ?? ""} · ${a.recipientCount} ${a.recipientCount === 1 ? "familia" : "familias"}`}
        actions={a.sentAt ? <Chip tone="mint">Enviado</Chip> : <Chip tone="sun">Programado</Chip>}
      />
      {!a.sentAt && a.scheduledFor && (
        <Alert tone="info">
          Se enviará a las 7:00 a. m. (fuera del horario permitido de 7 a. m. a 8 p. m.). Si es urgente, crea
          uno nuevo marcado como urgente.
        </Alert>
      )}
      <Card className="whitespace-pre-line text-sm">{a.body}</Card>
      <p className="px-1 text-sm text-ink-soft">
        {withAccount} de {recipients.length} lo reciben en la app (push o correo). A los demás, envíalo por
        WhatsApp:
      </p>
      <WhatsAppSender
        slug={slug}
        title={a.title}
        groupText={a.body
          .replaceAll("{acudiente}", "familias")
          .replaceAll("{alumnos}", "sus hijos")
          .replaceAll("{grupo}", "el grupo")
          .replaceAll("{escuela}", school.name)}
        recipients={recipients.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          message: r.message,
          inApp: Boolean(r.userId),
          sent: Boolean(r.whatsappSentAt),
        }))}
      />
    </div>
  );
}
