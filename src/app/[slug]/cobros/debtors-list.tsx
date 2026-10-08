"use client";

import { MessageCircle, Send } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { FormStatus } from "@/components/form-status";
import { Button, Chip, Select, Tile } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { whatsappLink } from "@/lib/whatsapp";
import type { ActionState } from "../action-context";
import { sendRemindersAction } from "./actions";

type Debtor = {
  guardianId: string;
  name: string;
  phone: string;
  athletes: string[];
  groupIds: string[];
  total: number;
  overdue: number;
  oldestDueOn: string;
  buckets: Record<string, number>;
};

const AGE_FILTERS = [
  { value: "all", label: "Toda la cartera" },
  { value: "overdue", label: "Solo vencida" },
  { value: "d31", label: "Vencida más de 30 días" },
  { value: "d61", label: "Vencida más de 60 días" },
];

export function DebtorsList({
  slug,
  schoolName,
  groups,
  debtors,
}: {
  slug: string;
  schoolName: string;
  groups: { id: string; name: string }[];
  debtors: Debtor[];
}) {
  const [group, setGroup] = useState("");
  const [age, setAge] = useState("all");
  const [min, setMin] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const visible = useMemo(
    () =>
      debtors.filter((d) => {
        if (group && !d.groupIds.includes(group)) return false;
        if (min && d.total < Number(min.replace(/\D/g, ""))) return false;
        const older30 = d.buckets.d31_60 + d.buckets.d61_90 + d.buckets.d90;
        const older60 = d.buckets.d61_90 + d.buckets.d90;
        if (age === "overdue" && d.overdue <= 0) return false;
        if (age === "d31" && older30 <= 0) return false;
        if (age === "d61" && older60 <= 0) return false;
        return true;
      }),
    [debtors, group, min, age],
  );

  if (debtors.length === 0) {
    return <Tile className="text-center text-sm text-ink-soft">Nadie debe nada. 🎉</Tile>;
  }
  const payUrl = `${origin}/${slug}/mis-pagos`;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Select aria-label="Filtrar por grupo" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Todos los grupos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrar por edad de la deuda"
          value={age}
          onChange={(e) => setAge(e.target.value)}
        >
          {AGE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <input
          aria-label="Deuda mínima"
          placeholder="Deuda mínima"
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="h-11 rounded-2xl border border-line bg-surface px-3.5 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-brand"
            checked={visible.length > 0 && visible.every((d) => selected.includes(d.guardianId))}
            onChange={(e) => setSelected(e.target.checked ? visible.map((d) => d.guardianId) : [])}
          />
          Seleccionar {visible.length}
        </label>
        <Button
          variant="secondary"
          className="h-9 px-4"
          disabled={pending || selected.length === 0}
          onClick={() => startTransition(async () => setState(await sendRemindersAction(slug, selected)))}
        >
          <Send className="size-4" /> Enviar recordatorio ({selected.length})
        </Button>
        <FormStatus state={state} />
      </div>
      <ul className="divide-y divide-line" aria-label="Deudores">
        {visible.map((d) => (
          <li key={d.guardianId} className="flex flex-wrap items-center gap-3 py-3">
            <input
              type="checkbox"
              aria-label={`Seleccionar a ${d.name}`}
              className="size-4 accent-brand"
              checked={selected.includes(d.guardianId)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked ? [...s, d.guardianId] : s.filter((id) => id !== d.guardianId),
                )
              }
            />
            <div className="min-w-0 flex-1">
              <Link
                href={`/${slug}/acudientes/${d.guardianId}`}
                className="block truncate font-semibold hover:text-brand"
              >
                {d.name}
              </Link>
              <p className="truncate text-xs text-ink-soft">{d.athletes.join(", ")}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{formatCOP(d.total)}</p>
              {d.overdue > 0 ? <Chip tone="danger">Vencida desde {d.oldestDueOn}</Chip> : <Chip>Al día</Chip>}
            </div>
            <a
              href={whatsappLink(
                d.phone,
                `Hola ${d.name.split(" ")[0]}, te escribimos de ${schoolName}. Tienes un saldo pendiente de ${formatCOP(d.total)}. Puedes ver el detalle y pagar aquí: ${payUrl}. Si ya pagaste, por favor ignora este mensaje.`,
              )}
              target="_blank"
              rel="noreferrer"
              className="grid size-10 place-items-center rounded-full border border-line bg-surface text-mint shadow-pill"
              aria-label={`Recordar por WhatsApp a ${d.name}`}
            >
              <MessageCircle className="size-4" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
