import { Megaphone, Pin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, Chip, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { isoDateOf, todayIn } from "@/lib/dates";
import {
  AUDIENCE_KINDS,
  listAnnouncements,
  receivedAnnouncements,
} from "@/modules/announcements/announcements";
import { guardianIdsOfUser } from "@/modules/portal/family";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";

export const metadata: Metadata = { title: "Avisos" };

export default async function AnnouncementsPage({ params }: PageProps<"/[slug]/avisos">) {
  const { slug } = await params;
  const { school, user, roles } = await getSchoolContext(slug);
  const manager = canManagePeople(roles);
  const coach = roles.includes("COACH");
  const today = todayIn(school.timezone);

  if (!manager && !coach) {
    // Familias: los avisos que recibieron.
    const items = await asPortalUser(user.id, async () => {
      const [guardianId] = await guardianIdsOfUser(db, school.id, user.id);
      return receivedAnnouncements(db, school.id, { guardianId, userId: user.id });
    });
    return (
      <div className="space-y-4">
        <PageHeader title="Avisos" subtitle={school.name} />
        {items.length === 0 ? (
          <Card className="text-center text-sm text-ink-soft">Aún no hay avisos.</Card>
        ) : (
          <ul className="space-y-3" aria-label="Avisos recibidos">
            {items.map(({ announcement: a, message }) => (
              <li key={a.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 text-lg font-semibold">{a.title}</p>
                    {a.urgent && <Chip tone="danger">Urgente</Chip>}
                    {a.pinnedUntil && a.pinnedUntil >= today && (
                      <Chip tone="sun">
                        <Pin className="size-3" /> Fijado
                      </Chip>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm">{message}</p>
                  <p className="mt-2 text-xs text-ink-faint">{isoDateOf(a.createdAt, school.timezone)}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const items = await listAnnouncements(db, school.id, manager ? {} : { authorUserId: user.id });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Avisos"
        subtitle="Mensajes a la escuela, a grupos o a familias. Llegan por la app, push o correo, y puedes copiarlos para WhatsApp."
        actions={
          <Link href={`/${slug}/avisos/nuevo`} className={buttonClass("primary", "h-10")}>
            <Plus className="size-4" /> Nuevo aviso
          </Link>
        }
      />
      {items.length === 0 ? (
        <Card className="mx-auto max-w-md text-center">
          <span className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
            <Megaphone className="size-5" />
          </span>
          <p className="font-semibold">Aún no has enviado avisos</p>
          <p className="mt-1 text-sm text-ink-soft">
            Ej.: “Mañana no hay clase por lluvia”, “Uniforme para el festival”.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line" aria-label="Avisos enviados">
            {items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/${slug}/avisos/${a.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.title}</span>
                    <span className="block text-xs text-ink-soft">
                      {AUDIENCE_KINDS[a.audience.kind as keyof typeof AUDIENCE_KINDS] ?? "Audiencia"} ·{" "}
                      {a.recipientCount} {a.recipientCount === 1 ? "familia" : "familias"}
                    </span>
                  </span>
                  {a.urgent && <Chip tone="danger">Urgente</Chip>}
                  {a.sentAt ? <Chip tone="mint">Enviado</Chip> : <Chip tone="sun">Programado</Chip>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
