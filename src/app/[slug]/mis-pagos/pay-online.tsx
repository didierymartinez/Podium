"use client";

import { CreditCard, Download } from "lucide-react";
import { useState, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { Button, Chip } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import type { ActionState } from "../action-context";
import { payOnlineAction } from "./actions";

type OpenInvoice = {
  id: string;
  code: string;
  label: string;
  dueOn: string;
  balance: number;
  overdue: boolean;
  pdf: string;
};

export function PayOnline({
  slug,
  online,
  invoices,
}: {
  slug: string;
  online: boolean;
  invoices: OpenInvoice[];
}) {
  const [picked, setPicked] = useState<string[]>(invoices.map((i) => i.id));
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const total = invoices.filter((i) => picked.includes(i.id)).reduce((s, i) => s + i.balance, 0);

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line" aria-label="Cuentas por pagar">
        {invoices.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
            {online && (
              <input
                type="checkbox"
                aria-label={`Pagar ${i.code}`}
                className="size-4 accent-brand"
                checked={picked.includes(i.id)}
                onChange={(e) =>
                  setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))
                }
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{i.label}</span>
              <span className="block text-xs text-ink-soft">
                {i.code} · vence {i.dueOn}
              </span>
            </span>
            {i.overdue && <Chip tone="danger">Vencida</Chip>}
            <span className="font-semibold tabular-nums">{formatCOP(i.balance)}</span>
            <a
              href={i.pdf}
              target="_blank"
              rel="noreferrer"
              className="text-brand"
              aria-label={`PDF ${i.code}`}
            >
              <Download className="size-4" />
            </a>
          </li>
        ))}
      </ul>
      {online ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={pending || picked.length === 0}
            onClick={() => startTransition(async () => setState((await payOnlineAction(slug, picked)) ?? {}))}
          >
            <CreditCard className="size-4" />{" "}
            {pending ? "Abriendo Wompi…" : `Pagar ${formatCOP(total)} en línea`}
          </Button>
          <span className="text-xs text-ink-soft">
            PSE, tarjeta, Nequi o Bancolombia. Si pagas a tiempo aplica el pronto pago.
          </span>
          <FormStatus state={state} />
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          Paga por los medios que te indique la escuela (efectivo o transferencia).
        </p>
      )}
    </div>
  );
}
