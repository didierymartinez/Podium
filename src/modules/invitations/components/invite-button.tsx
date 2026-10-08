"use client";

import { Check, Copy, Mail, MessageCircle, Send, X } from "lucide-react";
import { useState, useTransition } from "react";
import { shareInvitationAction, type ShareInvitationResult } from "@/app/[slug]/invitaciones/actions";
import { Alert, Button, buttonClass, cn } from "@/components/ui";
import type { InvitationTarget } from "../invitations";

/**
 * "Invitar": genera un link nuevo (el anterior deja de servir) y ofrece WhatsApp con el mensaje
 * listo, copiar el link o email. WhatsApp "manual asistido" (docs/WHATSAPP_COMUNICACIONES.md).
 */
export function InviteButton({
  slug,
  target,
  label = "Invitar",
  resend = false,
  className,
}: {
  slug: string;
  target: InvitationTarget;
  label?: string;
  resend?: boolean;
  className?: string;
}) {
  const [result, setResult] = useState<ShareInvitationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const generate = () =>
    startTransition(async () => {
      setCopied(false);
      setResult(await shareInvitationAction(slug, target));
    });

  return (
    <div className={cn("relative", className)}>
      <Button variant="secondary" className="h-9 px-3.5" onClick={generate} disabled={pending}>
        <Send className="size-4" /> {pending ? "Generando…" : resend ? "Reenviar" : label}
      </Button>

      {result && (
        <div
          role="dialog"
          aria-label="Compartir invitación"
          className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-soft"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{result.ok ? "Invitación lista" : "No se pudo invitar"}</p>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-full p-1 text-ink-soft hover:bg-muted"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>
          {!result.ok ? (
            <Alert>{result.message}</Alert>
          ) : (
            <>
              <p className="max-h-28 overflow-auto rounded-xl bg-canvas p-3 text-xs text-ink-soft">
                {result.message}
              </p>
              <div className="grid gap-2">
                {result.whatsappUrl && (
                  <a
                    href={result.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClass("primary", "h-10 bg-mint hover:bg-mint/90")}
                  >
                    <MessageCircle className="size-4" /> Enviar por WhatsApp
                  </a>
                )}
                <Button
                  variant="secondary"
                  className="h-10"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(result.message).catch(() => {});
                    setCopied(true);
                  }}
                >
                  {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
                  {copied ? "Copiado" : "Copiar mensaje con el link"}
                </Button>
                {result.mailtoUrl && (
                  <a href={result.mailtoUrl} className={buttonClass("ghost", "h-10")}>
                    <Mail className="size-4" /> Enviar por email
                  </a>
                )}
              </div>
              <input
                readOnly
                value={result.link}
                aria-label="Link de invitación"
                className="w-full truncate rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink-soft"
                onFocus={(e) => e.currentTarget.select()}
              />
              <p className="text-xs text-ink-faint">
                Vence en 7 días. Si generas otro link, este deja de funcionar.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
