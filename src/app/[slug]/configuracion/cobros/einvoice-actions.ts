"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { alegraProvider } from "@/modules/einvoicing/alegra";
import {
  accountSchema,
  connectAccount,
  issuePending,
  retryEInvoice,
  setAccountEnabled,
} from "@/modules/einvoicing/einvoicing";
import { canManagePeople, canManageSettings } from "@/modules/schools/permissions";
import { getActionContext } from "../../action-context";

type Result = { ok: boolean; message?: string };

export async function connectEInvoicingAction(slug: string, input: unknown): Promise<Result> {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const r = await connectAccount(db, member.ctx, parsed.data, alegraProvider());
  refresh();
  return r.ok ? { ok: true, message: `Conectado con ${r.company}.` } : { ok: false, message: r.error };
}

export async function toggleEInvoicingAction(slug: string, enabled: boolean): Promise<Result> {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return { ok: false };
  await setAccountEnabled(db, member.ctx, enabled);
  refresh();
  return { ok: true };
}

/** Emite ya lo pendiente (también lo hace la tarea diaria). */
export async function issueEInvoicesAction(slug: string, invoiceId?: string): Promise<Result> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  if (invoiceId) await retryEInvoice(db, member.ctx, invoiceId);
  const issued = await issuePending(db, member.school.id, alegraProvider(), todayIn(member.school.timezone));
  refresh();
  return { ok: true, message: `${issued} ${issued === 1 ? "factura emitida" : "facturas emitidas"}.` };
}
