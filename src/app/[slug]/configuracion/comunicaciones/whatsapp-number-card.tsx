"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card, Chip, Field, Input, SectionTitle } from "@/components/ui";
import { connectNumberAction, toggleNumberAction } from "../../mensajes/actions";

/** Número propio de WhatsApp Business de la escuela (Fase 3). */
export function WhatsAppNumberCard({
  slug,
  canEdit,
  account,
}: {
  slug: string;
  canEdit: boolean;
  account: {
    phoneNumberId: string;
    businessAccountId: string;
    displayPhone: string | null;
    template: string;
    enabled: boolean;
  } | null;
}) {
  const [v, setV] = useState({
    phoneNumberId: account?.phoneNumberId ?? "",
    businessAccountId: account?.businessAccountId ?? "",
    token: "",
    template: account?.template ?? "aviso_podium",
  });
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));
  return (
    <Card className="max-w-3xl space-y-3" aria-label="Número de WhatsApp de la escuela">
      <SectionTitle
        action={
          account ? (
            <Chip tone={account.enabled ? "mint" : "neutral"}>
              {account.enabled ? "Conectado" : "Pausado"}
            </Chip>
          ) : undefined
        }
      >
        Número propio de WhatsApp
      </SectionTitle>
      <p className="text-sm text-ink-soft">
        Con tu número de WhatsApp Business los avisos salen a nombre de la escuela y las respuestas de las
        familias llegan a la bandeja de Mensajes. Copia los datos de tu número desde Meta Business (WhatsApp →
        Configuración de la API). Sin número propio, los avisos salen por el número de Podium.
      </p>
      {account?.displayPhone && <p className="text-sm font-semibold">Número: {account.displayPhone}</p>}
      {canEdit && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await connectNumberAction(slug, v);
              setMessage(r.message ? { tone: r.ok ? "info" : "danger", text: r.message } : null);
            });
          }}
        >
          <Field label="Id del número de teléfono">
            <Input
              inputMode="numeric"
              value={v.phoneNumberId}
              onChange={(e) => set("phoneNumberId", e.target.value)}
            />
          </Field>
          <Field label="Id de la cuenta de WhatsApp Business">
            <Input
              inputMode="numeric"
              value={v.businessAccountId}
              onChange={(e) => set("businessAccountId", e.target.value)}
            />
          </Field>
          <Field label="Token de acceso permanente">
            <Input
              type="password"
              autoComplete="off"
              value={v.token}
              placeholder={account ? "•••••• (guardado)" : ""}
              onChange={(e) => set("token", e.target.value)}
            />
          </Field>
          <Field label="Plantilla de avisos aprobada">
            <Input value={v.template} onChange={(e) => set("template", e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" variant="secondary" disabled={pending}>
              {account ? "Actualizar número" : "Conectar número"}
            </Button>
            {account && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => start(async () => void (await toggleNumberAction(slug, !account.enabled)))}
              >
                {account.enabled ? "Pausar" : "Reanudar"}
              </Button>
            )}
          </div>
        </form>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </Card>
  );
}
