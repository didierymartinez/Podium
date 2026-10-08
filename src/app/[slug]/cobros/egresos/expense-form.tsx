"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, IconButton, Input, SectionTitle, Select } from "@/components/ui";
import { EXPENSE_CATEGORY_LABELS, METHOD_LABELS, type ExpenseCategory } from "@/modules/billing/labels";
import { deleteExpenseAction, recordExpenseAction } from "./actions";

export function ExpenseForm({ slug, today }: { slug: string; today: string }) {
  const [v, setV] = useState({
    category: "VENUE" as ExpenseCategory,
    description: "",
    amount: "",
    spentOn: today,
    method: "TRANSFER" as keyof typeof METHOD_LABELS,
  });
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));
  return (
    <Card>
      <SectionTitle>Registrar egreso</SectionTitle>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await recordExpenseAction(slug, { ...v, amount: Number(v.amount.replace(/\D/g, "")) });
            setMessage(
              r.ok
                ? { tone: "info", text: "Egreso registrado." }
                : { tone: "danger", text: r.message ?? "No se pudo guardar." },
            );
            if (r.ok) setV((s) => ({ ...s, description: "", amount: "" }));
          });
        }}
      >
        <Field label="Categoría">
          <Select value={v.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descripción">
          <Input value={v.description} maxLength={160} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <Input inputMode="numeric" value={v.amount} onChange={(e) => set("amount", e.target.value)} />
          </Field>
          <Field label="Fecha">
            <Input
              type="date"
              max={today}
              value={v.spentOn}
              onChange={(e) => set("spentOn", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Medio">
          <Select value={v.method} onChange={(e) => set("method", e.target.value)}>
            {(["CASH", "TRANSFER", "DEPOSIT", "CARD"] as const).map((k) => (
              <option key={k} value={k}>
                {METHOD_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" disabled={pending}>
          Registrar egreso
        </Button>
      </form>
    </Card>
  );
}

export function DeleteExpenseButton({
  slug,
  expenseId,
  description,
}: {
  slug: string;
  expenseId: string;
  description: string;
}) {
  const [pending, start] = useTransition();
  return (
    <IconButton
      aria-label={`Borrar egreso ${description}`}
      disabled={pending}
      onClick={() => {
        if (confirm(`¿Borrar el egreso "${description}"?`))
          start(async () => void (await deleteExpenseAction(slug, expenseId)));
      }}
    >
      <Trash2 className="size-4" />
    </IconButton>
  );
}
