"use client";

import { Check, CreditCard, Link2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Chip, cn } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { checkoutAction } from "./actions";
import { CardForm } from "./card-form";

export type PlanOption = {
  code: string;
  name: string;
  maxAthletes: number | null;
  monthly: number;
  annual: number;
};

export function PlanPicker({
  slug,
  plans,
  suggested,
  current,
  enabled,
  card,
}: {
  slug: string;
  plans: PlanOption[];
  suggested: string;
  current: string | null;
  enabled: boolean;
  card: { publicKey: string; apiBase: string } | null;
}) {
  const [interval, setInterval] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [selected, setSelected] = useState(
    current && plans.some((p) => p.code === current) ? current : suggested,
  );
  const [withCard, setWithCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const plan = plans.find((p) => p.code === selected)!;
  const price = interval === "ANNUAL" ? plan.annual : plan.monthly;

  return (
    <div className="space-y-4">
      <div
        className="inline-flex rounded-full border border-line bg-surface p-1"
        role="radiogroup"
        aria-label="Periodicidad"
      >
        {(["MONTHLY", "ANNUAL"] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setInterval(i)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold",
              interval === i ? "bg-brand text-white" : "text-ink-soft",
            )}
          >
            {i === "MONTHLY" ? "Mensual" : "Anual · 2 meses gratis"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Planes">
        {plans.map((p) => (
          <button
            key={p.code}
            type="button"
            role="radio"
            aria-checked={selected === p.code}
            aria-label={`Plan ${p.name}`}
            onClick={() => setSelected(p.code)}
            className={cn(
              "rounded-2xl border p-4 text-left transition",
              selected === p.code
                ? "border-brand bg-brand/5 ring-4 ring-brand/10"
                : "border-line bg-surface hover:border-brand/40",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">{p.name}</span>
              {p.code === suggested && <Chip tone="brand">Sugerido</Chip>}
              {p.code === current && p.code !== suggested && <Chip>Actual</Chip>}
            </span>
            <span className="mt-1 block text-xs text-ink-soft">
              {p.maxAthletes ? `Hasta ${p.maxAthletes} alumnos activos` : "Alumnos ilimitados"}
            </span>
            <span className="mt-3 block text-xl font-semibold">
              {formatCOP(interval === "ANNUAL" ? p.annual : p.monthly)}
              <span className="text-sm font-normal text-ink-soft">
                {interval === "ANNUAL" ? "/año" : "/mes"}
              </span>
            </span>
            {selected === p.code && <Check className="mt-2 size-4 text-brand" aria-hidden />}
          </button>
        ))}
      </div>

      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!enabled || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await checkoutAction(slug, plan.code, interval);
              if (result.ok) window.location.href = result.url;
              else setError(result.message);
            })
          }
        >
          <Link2 className="size-4" />{" "}
          {pending ? "Abriendo Wompi…" : `Pagar ${formatCOP(price)} con PSE, Nequi o tarjeta`}
        </Button>
        {card && (
          <Button variant="secondary" disabled={!enabled} onClick={() => setWithCard((v) => !v)}>
            <CreditCard className="size-4" /> Tarjeta con cobro automático
          </Button>
        )}
      </div>
      {withCard && card && enabled && (
        <CardForm slug={slug} planCode={plan.code} interval={interval} amount={price} config={card} />
      )}
    </div>
  );
}
