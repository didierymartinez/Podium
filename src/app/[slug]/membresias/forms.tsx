"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, Input, SectionTitle, Select } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { createMemberAction, createPlanAction, receptionCheckInAction, sellAction } from "./actions";

type Msg = { tone: "info" | "danger"; text: string } | null;
const toMsg = (r: { ok: boolean; message?: string }): Msg =>
  r.message ? { tone: r.ok ? "info" : "danger", text: r.message } : null;

export function ReceptionCheckIn({
  slug,
  members,
}: {
  slug: string;
  members: { id: string; name: string }[];
}) {
  const [id, setId] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const chosen = members.some((m) => m.id === id) ? id : (members[0]?.id ?? "");
  return (
    <Card aria-label="Ingreso en recepción">
      <SectionTitle>Ingreso en recepción</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="Socio"
          className="w-auto min-w-56"
          value={chosen}
          onChange={(e) => setId(e.target.value)}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Button
          disabled={pending || !chosen}
          onClick={() => start(async () => setMsg(toMsg(await receptionCheckInAction(slug, chosen))))}
        >
          Registrar ingreso
        </Button>
      </div>
      {msg && (
        <div className="mt-2">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}
    </Card>
  );
}

export function SellMembership({
  slug,
  athleteId,
  name,
  plans,
}: {
  slug: string;
  athleteId: string;
  name: string;
  plans: { id: string; name: string }[];
}) {
  const [planId, setPlanId] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const chosen = plans.some((p) => p.id === planId) ? planId : (plans[0]?.id ?? "");
  if (plans.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={`Plan para ${name}`}
        className="h-9 w-auto"
        value={chosen}
        onChange={(e) => setPlanId(e.target.value)}
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Button
        variant="secondary"
        className="h-9"
        disabled={pending}
        aria-label={`Vender membresía a ${name}`}
        onClick={() => start(async () => setMsg(toMsg(await sellAction(slug, athleteId, chosen))))}
      >
        Vender / renovar
      </Button>
      {msg && (
        <span className={msg.tone === "info" ? "text-xs text-mint" : "text-xs text-danger"}>{msg.text}</span>
      )}
    </div>
  );
}

export function MemberForm({ slug }: { slug: string }) {
  const empty = { firstName: "", lastName: "", birthDate: "", phone: "", email: "" };
  const [v, setV] = useState(empty);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));
  return (
    <Card>
      <SectionTitle>Nuevo socio</SectionTitle>
      <form
        className="space-y-3"
        aria-label="Nuevo socio"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createMemberAction(slug, v);
            setMsg(toMsg(r));
            if (r.ok) setV(empty);
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombres">
            <Input value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </Field>
          <Field label="Apellidos">
            <Input value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </Field>
          <Field label="Nacimiento">
            <Input type="date" value={v.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
          </Field>
          <Field label="Celular">
            <Input inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
        </div>
        <Field label="Correo (opcional)">
          <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" variant="secondary" disabled={pending}>
          Crear socio
        </Button>
      </form>
    </Card>
  );
}

export function PlanForm({
  slug,
  plans,
}: {
  slug: string;
  plans: {
    id: string;
    name: string;
    kind: "PERIOD" | "VISITS";
    days: number;
    visits: number | null;
    price: number;
  }[];
}) {
  const [v, setV] = useState({
    name: "",
    kind: "PERIOD" as "PERIOD" | "VISITS",
    days: "30",
    visits: "",
    price: "",
  });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <SectionTitle>Planes</SectionTitle>
      <ul className="mb-3 space-y-1 text-sm" aria-label="Planes de membresía">
        {plans.map((p) => (
          <li key={p.id} className="flex justify-between gap-2">
            <span>
              {p.name} · {p.kind === "VISITS" ? `${p.visits} visitas en ${p.days} días` : `${p.days} días`}
            </span>
            <span className="font-semibold">{formatCOP(p.price)}</span>
          </li>
        ))}
        {plans.length === 0 && <li className="text-ink-soft">Crea tu primer plan.</li>}
      </ul>
      <form
        className="space-y-3"
        aria-label="Nuevo plan"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createPlanAction(slug, {
              name: v.name,
              kind: v.kind,
              days: Number(v.days),
              visits: v.kind === "VISITS" ? Number(v.visits) || null : null,
              price: Number(v.price.replace(/\D/g, "")),
            });
            setMsg(toMsg(r));
          });
        }}
      >
        <Field label="Nombre del plan">
          <Input value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo de plan">
            <Select
              value={v.kind}
              onChange={(e) => setV((s) => ({ ...s, kind: e.target.value as typeof s.kind }))}
            >
              <option value="PERIOD">Por periodo</option>
              <option value="VISITS">Ticketera</option>
            </Select>
          </Field>
          <Field label="Vigencia (días)">
            <Input
              type="number"
              min={1}
              value={v.days}
              onChange={(e) => setV((s) => ({ ...s, days: e.target.value }))}
            />
          </Field>
          {v.kind === "VISITS" && (
            <Field label="Visitas">
              <Input
                type="number"
                min={1}
                value={v.visits}
                onChange={(e) => setV((s) => ({ ...s, visits: e.target.value }))}
              />
            </Field>
          )}
          <Field label="Precio">
            <Input
              inputMode="numeric"
              value={v.price}
              onChange={(e) => setV((s) => ({ ...s, price: e.target.value }))}
            />
          </Field>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" variant="secondary" disabled={pending}>
          Crear plan
        </Button>
      </form>
    </Card>
  );
}
