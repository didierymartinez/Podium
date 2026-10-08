import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, Chip, SectionTitle, cn } from "@/components/ui";
import { db } from "@/db/client";
import { displayPhone } from "@/lib/phone";
import { canManagePeople } from "@/modules/schools/permissions";
import {
  canReply,
  getSchoolNumber,
  listConversations,
  openConversation,
  staffMembers,
} from "@/modules/whatsapp/inbox";
import { getSchoolContext } from "../data";
import { AssignSelect, ReplyBox } from "./thread";

export const metadata: Metadata = { title: "Mensajes" };

const time = (d: Date) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);

/** Bandeja de WhatsApp de la escuela (WHATSAPP Fase 3). */
export default async function InboxPage({ params, searchParams }: PageProps<"/[slug]/mensajes">) {
  const { slug } = await params;
  const { c } = await searchParams;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const [account, conversations, staff] = await Promise.all([
    getSchoolNumber(db, school.id),
    listConversations(db, school.id),
    staffMembers(db, school.id),
  ]);
  const selected = typeof c === "string" && conversations.some((x) => x.id === c) ? c : undefined;
  const thread = selected ? await openConversation(db, school.id, selected) : null;
  const current = conversations.find((x) => x.id === selected);
  const now = new Date();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mensajes"
        subtitle={
          account
            ? `WhatsApp de la escuela · ${account.displayPhone ?? ""}${account.enabled ? "" : " (pausado)"}`
            : "Conecta el número de WhatsApp de la escuela en Configuración → Comunicaciones"
        }
      />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="p-3">
          <SectionTitle>Conversaciones</SectionTitle>
          <ul className="space-y-1" aria-label="Conversaciones">
            {conversations.map((x) => (
              <li key={x.id}>
                <Link
                  href={`/${slug}/mensajes?c=${x.id}`}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                    x.id === selected ? "bg-brand/10" : "hover:bg-muted",
                  )}
                >
                  <MessageCircle className="size-4 shrink-0 text-ink-soft" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {x.guardianName ?? x.contactName ?? displayPhone(x.contactPhone)}
                    </span>
                    <span className="block text-xs text-ink-soft">{time(x.lastMessageAt)}</span>
                  </span>
                  {x.unread > 0 && <Chip tone="brand">{x.unread}</Chip>}
                </Link>
              </li>
            ))}
            {conversations.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-soft">Aún no hay mensajes.</li>
            )}
          </ul>
        </Card>
        <Card className="space-y-3">
          {!thread || !current ? (
            <p className="text-sm text-ink-soft">Elige una conversación.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 font-semibold">
                  {current.guardianName ?? current.contactName ?? "Contacto"} ·{" "}
                  {displayPhone(current.contactPhone)}
                </span>
                <AssignSelect
                  slug={slug}
                  conversationId={current.id}
                  value={current.assignedUserId ?? ""}
                  staff={staff}
                />
              </div>
              <ol className="max-h-[60vh] space-y-2 overflow-y-auto" aria-label="Mensajes de la conversación">
                {thread.messages.map((m) => (
                  <li
                    key={m.id}
                    className={cn("flex", m.direction === "OUT" ? "justify-end" : "justify-start")}
                  >
                    <span
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        m.direction === "OUT" ? "bg-brand text-white" : "bg-muted",
                      )}
                    >
                      {m.body}
                      <span className="mt-1 block text-[10px] opacity-70">
                        {time(m.createdAt)}
                        {m.direction === "OUT" && m.status
                          ? ` · ${m.status === "read" ? "leído" : m.status === "delivered" ? "entregado" : m.status === "failed" ? "falló" : "enviado"}`
                          : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              {canReply(current.lastInboundAt, now) ? (
                <ReplyBox slug={slug} conversationId={current.id} />
              ) : (
                <p className="text-sm text-ink-soft">
                  Pasaron más de 24 horas desde su último mensaje: WhatsApp no permite responder con texto
                  libre. Envíale un aviso.
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
