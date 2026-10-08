"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formReader } from "@/components/form-data";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { parseCOP } from "@/lib/money";
import { storage } from "@/lib/storage";
import { saveConcept, setConceptActive } from "@/modules/billing/concepts";
import {
  addCreditNote,
  chargeOneTime,
  creditNoteSchema,
  generateMonth,
  oneTimeChargeSchema,
  regenerateInvoice,
  voidInvoice,
} from "@/modules/billing/invoices";
import { disconnectPaymentAccount, paymentAccountSchema, savePaymentAccount } from "@/modules/billing/online";
import { manualPaymentSchema, recordPayment, voidPayment } from "@/modules/billing/payments";
import { readBillingPolicy } from "@/modules/billing/policy";
import { sendManualReminders } from "@/modules/billing/reminders";
import { wompiProvider } from "@/modules/payments/wompi";
import { canManagePeople, canManageSettings } from "@/modules/schools/permissions";
import { deliverSoon } from "../../deliver";
import { FORBIDDEN_STATE, getActionContext, type ActionState } from "../action-context";

const ONLY_ADMIN: ActionState = {
  ok: false,
  message: "Solo el propietario o un administrador pueden hacer esto.",
};
const amount = (raw: string) => parseCOP(raw) ?? Number.NaN;
const fail = (error: z.ZodError): ActionState => ({
  ok: false,
  message: "Revisa los campos marcados",
  errors: z.flattenError(error).fieldErrors,
});

async function billing(slug: string, admin = false) {
  const member = await getActionContext(slug, admin ? canManageSettings : canManagePeople);
  if (!member) return null;
  return {
    ...member,
    full: { ...member.ctx, slug },
    today: todayIn(member.school.timezone),
    policy: readBillingPolicy(member.school.settings.billing),
  };
}

export async function generateMonthAction(slug: string, period: string): Promise<ActionState> {
  const m = await billing(slug);
  if (!m) return FORBIDDEN_STATE;
  if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false, message: "Periodo inválido" };
  const result = await generateMonth(db, m.full, period, m.today, m.policy);
  deliverSoon(m.school.id);
  refresh();
  return {
    ok: true,
    message: result.invoices
      ? `Se generaron ${result.invoices} cuentas de cobro`
      : "No había cobros pendientes en ese mes",
  };
}

export async function oneTimeChargeAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const m = await billing(slug);
  if (!m) return FORBIDDEN_STATE;
  const f = formReader(form);
  const parsed = oneTimeChargeSchema.safeParse({
    athleteIds: form.getAll("athleteIds").map(String),
    description: f.text("description"),
    amount: amount(f.text("amount")),
    dueOn: f.text("dueOn"),
    kind: f.text("kind") || "ONE_TIME",
  });
  if (!parsed.success) return fail(parsed.error);
  const result = await chargeOneTime(db, m.full, parsed.data, m.today, m.policy);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.error === "no_payer"
          ? "Algún alumno no tiene responsable de pago. Agrégale un acudiente."
          : "Algún alumno no pertenece a la escuela.",
    };
  }
  deliverSoon(m.school.id);
  redirect(
    result.invoiceIds.length === 1
      ? `/${slug}/cobros/cuentas/${result.invoiceIds[0]}`
      : `/${slug}/cobros/cuentas`,
  );
}

export async function recordPaymentAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const m = await billing(slug);
  if (!m) return FORBIDDEN_STATE;
  const f = formReader(form);
  const parsed = manualPaymentSchema.safeParse({
    guardianId: f.text("guardianId"),
    amount: amount(f.text("amount")),
    paidOn: f.text("paidOn"),
    method: f.text("method"),
    reference: f.nullable("reference"),
    notes: f.nullable("notes"),
    proofFileId: f.nullable("fileId"),
    invoiceIds: form.getAll("invoiceIds").map(String),
  });
  if (!parsed.success) return fail(parsed.error);
  const result = await recordPayment(db, storage(), m.full, parsed.data, m.today, m.policy);
  if (!result.ok) {
    const messages = {
      not_found: "El acudiente no existe.",
      future_date: "La fecha del pago no puede ser futura.",
      file: "El soporte no se subió completo. Intenta de nuevo.",
      invalid_invoice: "Alguna cuenta ya no está abierta. Recarga la página.",
      duplicate: "Ese pago ya estaba registrado.",
    };
    return { ok: false, message: messages[result.error] };
  }
  deliverSoon(m.school.id);
  redirect(`/${slug}/cobros/pagos/${result.paymentId}`);
}

const reasonOf = (form: FormData) =>
  z
    .string()
    .trim()
    .min(3, "Escribe el motivo")
    .max(160)
    .safeParse(String(form.get("reason") ?? ""));

export async function voidPaymentAction(
  slug: string,
  paymentId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const m = await billing(slug, true);
  if (!m) return ONLY_ADMIN;
  const reason = reasonOf(form);
  if (!reason.success) return { ok: false, errors: { reason: [reason.error.issues[0].message] } };
  await voidPayment(db, m.ctx, paymentId, reason.data, m.policy);
  refresh();
  return { ok: true, message: "Pago anulado" };
}

export async function voidInvoiceAction(
  slug: string,
  invoiceId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const m = await billing(slug, true);
  if (!m) return ONLY_ADMIN;
  const reason = reasonOf(form);
  if (!reason.success) return { ok: false, errors: { reason: [reason.error.issues[0].message] } };
  await voidInvoice(db, m.ctx, invoiceId, reason.data, m.policy);
  refresh();
  return { ok: true, message: "Cuenta anulada" };
}

export async function creditNoteAction(
  slug: string,
  invoiceId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const m = await billing(slug, true);
  if (!m) return ONLY_ADMIN;
  const parsed = creditNoteSchema.safeParse({
    amount: amount(String(form.get("amount") ?? "")),
    reason: String(form.get("reason") ?? ""),
  });
  if (!parsed.success) return fail(parsed.error);
  const result = await addCreditNote(db, m.ctx, invoiceId, parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      errors: {
        amount: [result.error === "exceeds_balance" ? "No puede superar el saldo" : "La cuenta no existe"],
      },
    };
  }
  refresh();
  return { ok: true, message: "Nota crédito registrada" };
}

export async function regenerateInvoiceAction(slug: string, invoiceId: string): Promise<ActionState> {
  const m = await billing(slug);
  if (!m) return FORBIDDEN_STATE;
  const result = await regenerateInvoice(db, m.full, invoiceId, m.today, m.policy);
  if (!result.ok) return { ok: false, message: "Solo se regeneran mensualidades sin pagos." };
  redirect(result.invoiceId ? `/${slug}/cobros/cuentas/${result.invoiceId}` : `/${slug}/cobros/cuentas`);
}

export async function sendRemindersAction(slug: string, guardianIds: string[]): Promise<ActionState> {
  const m = await billing(slug);
  if (!m) return FORBIDDEN_STATE;
  const result = await sendManualReminders(db, m.school, guardianIds.slice(0, 500), new Date());
  deliverSoon(m.school.id);
  if (result.outsideHours) {
    return {
      ok: false,
      message:
        "Por la Ley 2300 los mensajes de cobro se envían de lunes a viernes de 7 a. m. a 7 p. m. y sábados de 8 a. m. a 3 p. m.",
    };
  }
  return {
    ok: true,
    message: `${result.sent} ${result.sent === 1 ? "recordatorio enviado" : "recordatorios enviados"}${result.skipped ? ` · ${result.skipped} omitidos (sin cuenta en la app o ya recibieron uno esta semana)` : ""}`,
  };
}

export async function savePaymentAccountAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const m = await billing(slug, true);
  if (!m) return ONLY_ADMIN;
  const f = formReader(form);
  const parsed = paymentAccountSchema.safeParse({
    environment: f.text("environment"),
    publicKey: f.text("publicKey"),
    privateKey: f.text("privateKey"),
    eventsSecret: f.text("eventsSecret"),
    integritySecret: f.text("integritySecret"),
  });
  if (!parsed.success) return fail(parsed.error);
  const result = await savePaymentAccount(db, wompiProvider(), m.ctx, parsed.data);
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: `Conectado con ${result.merchantName}` };
}

export async function disconnectPaymentAccountAction(slug: string): Promise<ActionState> {
  const m = await billing(slug, true);
  if (!m) return ONLY_ADMIN;
  await disconnectPaymentAccount(db, m.ctx);
  refresh();
  return { ok: true };
}

export async function saveConceptAction(
  slug: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const m = await billing(slug, true);
  if (!m) return ONLY_ADMIN;
  const f = formReader(form);
  const raw = f.text("defaultAmount");
  const result = await saveConcept(
    db,
    m.ctx,
    { name: f.text("name"), defaultAmount: raw ? amount(raw) : null },
    f.text("id") || undefined,
  );
  if (!result.ok) return { ok: false, errors: result.errors };
  refresh();
  return { ok: true, message: "Concepto guardado" };
}

export async function setConceptActiveAction(
  slug: string,
  id: string,
  active: boolean,
): Promise<ActionState> {
  const m = await billing(slug, true);
  if (!m) return ONLY_ADMIN;
  await setConceptActive(db, m.ctx, id, active);
  refresh();
  return { ok: true };
}
