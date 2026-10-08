"use client";

import { useActionState, type ReactNode } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import type { AdminState } from "../../../actions";
import {
  activatePlanAction,
  couponAction,
  enterSupportAction,
  extendTrialAction,
  suspendAction,
  unsuspendAction,
} from "../../../actions";

function ActionForm({
  action,
  submit,
  children,
  variant = "secondary",
}: {
  action: (prev: AdminState, form: FormData) => Promise<AdminState>;
  submit: string;
  children?: ReactNode;
  variant?: "secondary" | "danger" | "primary";
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  return (
    <form action={dispatch} className="space-y-2">
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {submit}
      </Button>
      {state.message && <Alert tone={state.ok ? "info" : "danger"}>{state.message}</Alert>}
    </form>
  );
}

export function ExtendTrialForm({ schoolId }: { schoolId: string }) {
  return (
    <ActionForm action={extendTrialAction.bind(null, schoolId)} submit="Extender prueba">
      <Field label="Días">
        <Input name="days" type="number" min={1} max={90} defaultValue={15} />
      </Field>
    </ActionForm>
  );
}

export function CouponForm({
  schoolId,
  percent,
  until,
}: {
  schoolId: string;
  percent: number;
  until: string | null;
}) {
  return (
    <ActionForm action={couponAction.bind(null, schoolId)} submit="Aplicar descuento">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Descuento %">
          <Input name="percent" type="number" min={0} max={100} defaultValue={percent} />
        </Field>
        <Field label="Hasta (opcional)">
          <Input name="until" type="date" defaultValue={until ?? ""} />
        </Field>
      </div>
    </ActionForm>
  );
}

export function ActivatePlanForm({
  schoolId,
  plans,
}: {
  schoolId: string;
  plans: { code: string; name: string }[];
}) {
  return (
    <ActionForm action={activatePlanAction.bind(null, schoolId)} submit="Activar plan (pago por fuera)">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Plan">
          <Select name="planCode">
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Periodo">
          <Select name="interval">
            <option value="MONTHLY">Mensual</option>
            <option value="ANNUAL">Anual</option>
          </Select>
        </Field>
      </div>
    </ActionForm>
  );
}

export function SuspendForm({ schoolId, suspended }: { schoolId: string; suspended: boolean }) {
  if (suspended)
    return (
      <ActionForm action={() => unsuspendAction(schoolId)} submit="Quitar suspensión" variant="primary" />
    );
  return (
    <ActionForm action={suspendAction.bind(null, schoolId)} submit="Suspender por abuso" variant="danger">
      <Field label="Motivo">
        <Input name="reason" minLength={5} required />
      </Field>
    </ActionForm>
  );
}

export function SupportForm({ schoolId }: { schoolId: string }) {
  return (
    <ActionForm action={enterSupportAction.bind(null, schoolId)} submit="Entrar como (solo lectura)">
      <Field label="Motivo (obligatorio, queda auditado)">
        <Input name="reason" minLength={5} required placeholder="Ticket de soporte, reporte de error…" />
      </Field>
    </ActionForm>
  );
}
