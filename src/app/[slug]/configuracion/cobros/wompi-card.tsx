"use client";

import { CheckCircle2, PlugZap } from "lucide-react";
import { useActionState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Chip, Field, Input, SectionTitle, Select, Tile } from "@/components/ui";
import type { ActionState } from "../context";
import { disconnectPaymentAccountAction, savePaymentAccountAction } from "../../cobros/actions";

export function WompiCard({
  slug,
  canEdit,
  account,
  webhookUrl,
}: {
  slug: string;
  canEdit: boolean;
  account: { environment: string; publicKey: string; merchantName: string | null } | null;
  webhookUrl: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    savePaymentAccountAction.bind(null, slug),
    {},
  );
  const [disconnecting, startDisconnect] = useTransition();
  const error = (k: string) => state.errors?.[k]?.[0];

  return (
    <Card>
      <SectionTitle
        action={
          account ? (
            <Chip tone="mint" dot>
              Conectado
            </Chip>
          ) : (
            <Chip>Sin conectar</Chip>
          )
        }
      >
        Pagos en línea con Wompi
      </SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Las familias pagan con PSE, tarjeta, Nequi o Bancolombia y el dinero llega directo a la cuenta Wompi
        de tu escuela. Copia las llaves desde el panel de Wompi → Desarrolladores.
      </p>
      {account && (
        <Tile className="mb-4 flex flex-wrap items-center gap-3">
          <CheckCircle2 className="size-5 text-mint" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{account.merchantName}</p>
            <p className="truncate text-xs text-ink-soft">
              {account.environment === "production" ? "Producción" : "Pruebas (sandbox)"} ·{" "}
              {account.publicKey}
            </p>
          </div>
          {canEdit && (
            <Button
              variant="ghost"
              className="h-9"
              disabled={disconnecting}
              onClick={() => startDisconnect(() => void disconnectPaymentAccountAction(slug))}
            >
              Desconectar
            </Button>
          )}
        </Tile>
      )}
      {canEdit && (
        <form onSubmit={submitWithoutReset(action)} className="space-y-3">
          <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
            <Field label="Ambiente">
              <Select name="environment" defaultValue={account?.environment ?? "sandbox"}>
                <option value="sandbox">Pruebas (sandbox)</option>
                <option value="production">Producción</option>
              </Select>
            </Field>
            <Field label="Llave pública" error={error("publicKey")}>
              <Input
                name="publicKey"
                defaultValue={account?.publicKey}
                placeholder="pub_prod_…"
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Llave privada" error={error("privateKey")}>
              <Input name="privateKey" type="password" placeholder="prv_prod_…" required autoComplete="off" />
            </Field>
            <Field label="Secreto de eventos" error={error("eventsSecret")}>
              <Input
                name="eventsSecret"
                type="password"
                placeholder="prod_events_…"
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Secreto de integridad" error={error("integritySecret")}>
              <Input
                name="integritySecret"
                type="password"
                placeholder="prod_integrity_…"
                required
                autoComplete="off"
              />
            </Field>
          </fieldset>
          <Tile className="text-xs text-ink-soft">
            En Wompi → Desarrolladores → URL de eventos, pega:{" "}
            <span className="break-all font-mono text-ink">{webhookUrl}</span>
          </Tile>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="secondary" className="h-10" disabled={pending}>
              <PlugZap className="size-4" /> {pending ? "Probando…" : "Probar y guardar"}
            </Button>
            <FormStatus state={state} />
          </div>
        </form>
      )}
    </Card>
  );
}
