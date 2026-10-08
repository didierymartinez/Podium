"use client";

import { useState, useTransition, type FormEvent } from "react";
import { FormStatus } from "@/components/form-status";
import { Button, Field, Input, Tile } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import type { ActionState } from "../action-context";
import { subscribeWithCardAction } from "./actions";

/**
 * La tarjeta se tokeniza directo en Wompi desde el navegador (los datos nunca pasan por Podium);
 * al servidor solo llega el token para crear la fuente de pago y cobrar cada periodo.
 */
export function CardForm({
  slug,
  planCode,
  interval,
  amount,
  config,
}: {
  slug: string;
  planCode: string;
  interval: "MONTHLY" | "ANNUAL";
  amount: number;
  config: { publicKey: string; apiBase: string };
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const [month, year] = String(form.get("exp"))
      .split("/")
      .map((s) => s.trim());
    start(async () => {
      try {
        const res = await fetch(`${config.apiBase}/tokens/cards`, {
          method: "POST",
          headers: { authorization: `Bearer ${config.publicKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            number: String(form.get("number")).replace(/\s/g, ""),
            cvc: String(form.get("cvc")),
            exp_month: month?.padStart(2, "0"),
            exp_year: year?.slice(-2),
            card_holder: String(form.get("holder")),
          }),
        });
        const body = (await res.json()) as { data?: { id?: string } };
        if (!res.ok || !body.data?.id) {
          setState({ ok: false, message: "Revisa los datos de la tarjeta." });
          return;
        }
        setState(await subscribeWithCardAction(slug, { cardToken: body.data.id, planCode, interval }));
      } catch {
        setState({ ok: false, message: "No pudimos conectar con Wompi. Intenta de nuevo." });
      }
    });
  }

  return (
    <Tile className="p-4">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4" autoComplete="on">
        <div className="sm:col-span-2">
          <Field label="Número de la tarjeta">
            <Input
              name="number"
              inputMode="numeric"
              autoComplete="cc-number"
              required
              pattern="[0-9 ]{13,23}"
            />
          </Field>
        </div>
        <Field label="Vence (MM/AA)">
          <Input
            name="exp"
            autoComplete="cc-exp"
            placeholder="08/29"
            required
            pattern="\d{1,2}\s*/\s*\d{2,4}"
          />
        </Field>
        <Field label="CVC">
          <Input name="cvc" inputMode="numeric" autoComplete="cc-csc" required pattern="\d{3,4}" />
        </Field>
        <div className="sm:col-span-4">
          <Field label="Nombre como aparece en la tarjeta">
            <Input name="holder" autoComplete="cc-name" required minLength={5} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
          <Button type="submit" disabled={pending}>
            {pending ? "Procesando…" : `Guardar tarjeta y pagar ${formatCOP(amount)}`}
          </Button>
          <FormStatus state={state} />
        </div>
        <p className="text-xs text-ink-soft sm:col-span-4">
          Se cobrará automáticamente cada {interval === "ANNUAL" ? "año" : "mes"}. Puedes cancelar cuando
          quieras.
        </p>
      </form>
    </Tile>
  );
}
