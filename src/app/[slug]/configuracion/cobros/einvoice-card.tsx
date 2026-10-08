"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card, Chip, Field, Input, SectionTitle } from "@/components/ui";
import { connectEInvoicingAction, issueEInvoicesAction, toggleEInvoicingAction } from "./einvoice-actions";

/** Conexión con el proveedor de facturación electrónica de la escuela (ADM-26). */
export function EInvoiceCard({
  slug,
  canEdit,
  account,
  recent,
}: {
  slug: string;
  canEdit: boolean;
  account: { username: string; itemId: string; enabled: boolean; verifiedAt: string | null } | null;
  recent: {
    code: string;
    status: "PENDING" | "ISSUED" | "ERROR";
    number: string | null;
    error: string | null;
  }[];
}) {
  const [v, setV] = useState({ username: account?.username ?? "", token: "", itemId: account?.itemId ?? "" });
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const show = (r: { ok: boolean; message?: string }) =>
    setMessage(r.message ? { tone: r.ok ? "info" : "danger", text: r.message } : null);

  return (
    <Card className="space-y-3" aria-label="Facturación electrónica">
      <SectionTitle>Facturación electrónica DIAN</SectionTitle>
      <p className="text-sm text-ink-soft">
        Si la escuela está obligada a facturar, conecta su cuenta de Alegra (con la facturación electrónica ya
        habilitada ante la DIAN). Cada cuenta de cobro pagada se emite como factura electrónica.
      </p>
      {account && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Chip tone={account.enabled ? "mint" : "neutral"}>{account.enabled ? "Activa" : "Pausada"}</Chip>
          Alegra · {account.username}
        </p>
      )}
      {canEdit && (
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => show(await connectEInvoicingAction(slug, v)));
          }}
        >
          <Field label="Correo de Alegra">
            <Input
              type="email"
              value={v.username}
              onChange={(e) => setV((s) => ({ ...s, username: e.target.value }))}
            />
          </Field>
          <Field label="Token de la API">
            <Input
              type="password"
              autoComplete="off"
              value={v.token}
              placeholder={account ? "•••••• (guardado)" : ""}
              onChange={(e) => setV((s) => ({ ...s, token: e.target.value }))}
            />
          </Field>
          <Field label="Id del ítem de servicio">
            <Input value={v.itemId} onChange={(e) => setV((s) => ({ ...s, itemId: e.target.value }))} />
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button type="submit" variant="secondary" disabled={pending}>
              {account ? "Actualizar conexión" : "Conectar Alegra"}
            </Button>
            {account && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => show(await toggleEInvoicingAction(slug, !account.enabled)))
                  }
                >
                  {account.enabled ? "Pausar" : "Reanudar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending || !account.enabled}
                  onClick={() => start(async () => show(await issueEInvoicesAction(slug)))}
                >
                  Emitir pendientes ahora
                </Button>
              </>
            )}
          </div>
        </form>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {recent.length > 0 && (
        <ul className="divide-y divide-line text-sm" aria-label="Facturas electrónicas">
          {recent.map((r) => (
            <li key={r.code} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="font-semibold">{r.code}</span>
              <Chip tone={r.status === "ISSUED" ? "mint" : r.status === "ERROR" ? "danger" : "sun"}>
                {r.status === "ISSUED"
                  ? `Emitida ${r.number ?? ""}`
                  : r.status === "ERROR"
                    ? "Error"
                    : "Pendiente"}
              </Chip>
              {r.error && <span className="text-xs text-danger">{r.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
