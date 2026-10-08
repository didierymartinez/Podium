import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, Chip } from "@/components/ui";
import { db } from "@/db/client";
import { isoDateOf, formatLongDate } from "@/lib/dates";
import { listNotifications, markAllRead } from "@/modules/notifications/notify";
import { getSchoolContext } from "../data";

export const metadata: Metadata = { title: "Notificaciones" };

export default async function NotificationsPage({ params }: PageProps<"/[slug]/notificaciones">) {
  const { slug } = await params;
  const { school, user } = await getSchoolContext(slug);
  const items = await listNotifications(db, school.id, user.id, 50);
  // Abrir la bandeja marca todo como leído (la lista ya trae el estado anterior).
  if (items.some((n) => !n.readAt)) await markAllRead(db, school.id, user.id);

  return (
    <div className="space-y-5">
      <PageHeader title="Notificaciones" subtitle={school.name} />
      {items.length === 0 ? (
        <Card className="text-center">
          <span className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
            <Bell className="size-5" />
          </span>
          <p className="font-semibold">Todo al día</p>
          <p className="mt-1 text-sm text-ink-soft">
            Aquí verás avisos de la escuela, cobros y cambios de tus clases.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2.5" aria-label="Notificaciones">
          {items.map((n) => {
            const content = (
              <Card className="flex items-start gap-3 p-4">
                <span
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full ${n.readAt ? "bg-line" : "bg-brand"}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{n.title}</p>
                  <p className="whitespace-pre-line text-sm text-ink-soft">{n.body}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {!n.readAt && <Chip tone="brand">Nueva</Chip>}
                  <span className="text-xs text-ink-faint">
                    {formatLongDate(isoDateOf(n.createdAt, school.timezone))}
                  </span>
                </div>
              </Card>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} className="block">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
