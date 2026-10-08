"use client";

import { useActionState, useMemo, useState } from "react";
import { AttachedFileField } from "@/components/attached-file-field";
import { FormStatus } from "@/components/form-status";
import { MoneyInput } from "@/components/money-input";
import { submitWithoutReset } from "@/components/use-form-action";
import { Button, Card, Field, Input, SectionTitle, Select, Tile } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import type { ActionState } from "../../../action-context";
import { recordPaymentAction } from "../../actions";

type InvoiceOption = {
  id: string;
  guardianId: string;
  code: string;
  dueOn: string;
  balance: number;
  period: string | null;
};

export function PaymentForm({
  slug,
  today,
  guardians,
  invoices,
  initialGuardianId,
  initialInvoiceId,
}: {
  slug: string;
  today: string;
  guardians: { id: string; name: string; athletes: string }[];
  invoices: InvoiceOption[];
  initialGuardianId: string;
  initialInvoiceId: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordPaymentAction.bind(null, slug),
    {},
  );
  const [guardianId, setGuardianId] = useState(initialGuardianId);
  const [query, setQuery] = useState("");
  const open = invoices.filter((i) => i.guardianId === guardianId);
  const [picked, setPicked] = useState<string[]>(initialInvoiceId ? [initialInvoiceId] : []);
  const chosen = picked.filter((id) => open.some((o) => o.id === id));
  const suggested = (chosen.length ? open.filter((o) => chosen.includes(o.id)) : open).reduce(
    (s, o) => s + o.balance,
    0,
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? guardians.filter((g) => `${g.name} ${g.athletes}`.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [query, guardians]);
  const error = (k: string) => state.errors?.[k]?.[0];
  const selected = guardians.find((g) => g.id === guardianId);

  return (
    <form onSubmit={submitWithoutReset(action)}>
      <input type="hidden" name="guardianId" value={guardianId} />
      {chosen.map((id) => (
        <input key={id} type="hidden" name="invoiceIds" value={id} />
      ))}
      <fieldset disabled={pending} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="space-y-4">
          <Field label="Acudiente" error={error("guardianId")}>
            {selected ? (
              <div className="flex items-center gap-2">
                <Tile className="flex-1 p-3">
                  <p className="font-semibold">{selected.name}</p>
                  <p className="text-xs text-ink-soft">{selected.athletes}</p>
                </Tile>
                <Button type="button" variant="ghost" onClick={() => setGuardianId("")}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Busca por acudiente o alumno"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Buscar acudiente"
                />
                <ul className="space-y-1">
                  {matches.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setGuardianId(g.id);
                          setPicked([]);
                        }}
                        className="w-full rounded-xl px-3 py-2 text-left hover:bg-muted"
                      >
                        <span className="block font-semibold">{g.name}</span>
                        <span className="block text-xs text-ink-soft">{g.athletes}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Valor"
              hint={suggested ? `Saldo: ${formatCOP(suggested)}` : undefined}
              error={error("amount")}
            >
              <MoneyInput name="amount" required key={guardianId} defaultValue={suggested || undefined} />
            </Field>
            <Field label="Fecha" error={error("paidOn")}>
              <Input type="date" name="paidOn" defaultValue={today} max={today} required />
            </Field>
            <Field label="Medio" error={error("method")}>
              <Select name="method" defaultValue="CASH">
                <option value="CASH">Efectivo</option>
                <option value="TRANSFER">Transferencia</option>
                <option value="DEPOSIT">Consignación</option>
                <option value="CARD">Datáfono</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Referencia" hint="Opcional · número de la transferencia" error={error("reference")}>
              <Input name="reference" maxLength={80} />
            </Field>
            <Field label="Notas" hint="Opcional" error={error("notes")}>
              <Input name="notes" maxLength={200} />
            </Field>
          </div>
          <AttachedFileField slug={slug} kind="PAYMENT_PROOF" label="Adjuntar soporte" />
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit" disabled={!guardianId}>
              {pending ? "Registrando…" : "Registrar pago"}
            </Button>
            <FormStatus state={state} />
          </div>
        </Card>
        <Card className="space-y-3 lg:self-start">
          <SectionTitle>¿A qué cuentas se aplica?</SectionTitle>
          <p className="-mt-2 text-sm text-ink-soft">
            Si no eliges, se aplica a la más antigua primero. Lo que sobre queda como saldo a favor.
          </p>
          {open.length === 0 ? (
            <Tile className="text-sm text-ink-soft">
              {guardianId ? "No tiene cuentas abiertas: quedará como saldo a favor." : "Elige un acudiente."}
            </Tile>
          ) : (
            <ul className="space-y-1.5" aria-label="Cuentas abiertas">
              {open.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      checked={picked.includes(o.id)}
                      onChange={(e) =>
                        setPicked((p) => (e.target.checked ? [...p, o.id] : p.filter((id) => id !== o.id)))
                      }
                    />
                    <span className="flex-1">
                      {o.code} · vence {o.dueOn}
                    </span>
                    <span className="font-semibold tabular-nums">{formatCOP(o.balance)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </fieldset>
    </form>
  );
}
