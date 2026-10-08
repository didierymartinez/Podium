"use client";

import { Check, ChevronRight, Copy, MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Card, Chip, SectionTitle, cn } from "@/components/ui";
import { whatsappLink } from "@/lib/whatsapp";
import { markWhatsAppSentAction } from "../actions";

type Recipient = {
  id: string;
  name: string;
  phone: string | null;
  message: string;
  inApp: boolean;
  sent: boolean;
};

/** "Copiar para WhatsApp" y envío en serie con wa.me (COM-13), marcando a quién ya se le escribió. */
export function WhatsAppSender({
  slug,
  title,
  groupText,
  recipients,
}: {
  slug: string;
  title: string;
  groupText: string;
  recipients: Recipient[];
}) {
  const [sent, setSent] = useState<string[]>(recipients.filter((r) => r.sent).map((r) => r.id));
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();
  const queue = recipients.filter((r) => r.phone && !sent.includes(r.id));
  const current = queue[0];

  function open(r: Recipient) {
    window.open(whatsappLink(r.phone!, `*${title}*\n${r.message}`), "_blank", "noopener");
    setSent((s) => [...s, r.id]);
    startTransition(() => void markWhatsAppSentAction(slug, r.id));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="p-0">
        <ul className="divide-y divide-line" aria-label="Destinatarios">
          {recipients.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5",
                sent.includes(r.id) && "opacity-60",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block truncate text-xs text-ink-soft">{r.message}</span>
              </span>
              {r.inApp ? <Chip tone="mint">En la app</Chip> : <Chip>Sin cuenta</Chip>}
              {r.phone ? (
                <button
                  type="button"
                  onClick={() => open(r)}
                  className="grid size-10 place-items-center rounded-full border border-line bg-surface text-mint shadow-pill"
                  aria-label={`WhatsApp a ${r.name}`}
                >
                  {sent.includes(r.id) ? <Check className="size-4" /> : <MessageCircle className="size-4" />}
                </button>
              ) : (
                <span className="text-xs text-ink-faint">Sin celular</span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <SectionTitle>Envío en serie</SectionTitle>
          {current ? (
            <>
              <p className="text-sm text-ink-soft">
                Siguiente: <strong className="text-ink">{current.name}</strong> ({queue.length} pendientes)
              </p>
              <Button className="mt-3" onClick={() => open(current)}>
                <MessageCircle className="size-4" /> Abrir WhatsApp <ChevronRight className="size-4" />
              </Button>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Ya le escribiste a todos los que tienen celular. ✓</p>
          )}
        </Card>
        <Card>
          <SectionTitle>Copiar para WhatsApp</SectionTitle>
          <p className="-mt-2 mb-3 text-sm text-ink-soft">
            Para pegar en el grupo de WhatsApp de la escuela.
          </p>
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(`*${title}*\n${groupText}`);
              setCopied(true);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{" "}
            {copied ? "Copiado" : "Copiar texto"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
