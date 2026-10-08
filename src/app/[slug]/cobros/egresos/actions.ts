"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { deleteExpense, expenseSchema, recordExpense } from "@/modules/billing/expenses";
import {
  createProduct,
  moveStock,
  productSchema,
  saleSchema,
  sellProduct,
  updateProduct,
} from "@/modules/billing/inventory";
import { readBillingPolicy } from "@/modules/billing/policy";
import { canManagePeople } from "@/modules/schools/permissions";
import { deliverSoon } from "../../../deliver";
import { getActionContext } from "../../action-context";

type Result = { ok: boolean; message?: string };
const FORBIDDEN: Result = { ok: false, message: "No tienes permiso para esta acción." };

export async function recordExpenseAction(slug: string, input: unknown): Promise<Result> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return FORBIDDEN;
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const id = await recordExpense(db, member.ctx, parsed.data, todayIn(member.school.timezone));
  if (!id) return { ok: false, message: "La fecha no puede ser futura." };
  refresh();
  return { ok: true };
}

export async function deleteExpenseAction(slug: string, expenseId: string): Promise<Result> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return FORBIDDEN;
  const ok = await deleteExpense(db, member.ctx, expenseId);
  refresh();
  return { ok };
}

export async function createProductAction(slug: string, input: unknown): Promise<Result> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return FORBIDDEN;
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const r = await createProduct(db, member.ctx, parsed.data);
  if (!r.ok) return { ok: false, message: "Ya existe un producto con ese nombre." };
  refresh();
  return { ok: true };
}

export async function updateProductAction(
  slug: string,
  productId: string,
  input: { price: number; active: boolean },
) {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return FORBIDDEN;
  const ok = await updateProduct(db, member.ctx, productId, input);
  refresh();
  return { ok };
}

export async function moveStockAction(
  slug: string,
  input: { productId: string; quantity: number; kind: "IN" | "ADJUST"; note: string },
): Promise<Result> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return FORBIDDEN;
  if (!Number.isInteger(input.quantity) || input.quantity === 0)
    return { ok: false, message: "Escribe la cantidad." };
  const ok = await moveStock(
    db,
    member.ctx,
    { ...input, note: input.note.trim().slice(0, 160) || null },
    todayIn(member.school.timezone),
  );
  if (!ok) return { ok: false, message: "El stock no puede quedar negativo." };
  refresh();
  return { ok: true };
}

const SALE_ERRORS = {
  not_found: "El producto o el alumno no existe.",
  no_stock: "No hay suficiente stock.",
  no_payer: "El alumno no tiene responsable de pago.",
} as const;

export async function sellProductAction(slug: string, input: unknown): Promise<Result> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return FORBIDDEN;
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const r = await sellProduct(
    db,
    { ...member.ctx, slug },
    parsed.data,
    todayIn(member.school.timezone),
    readBillingPolicy(member.school.settings.billing),
  );
  if (!r.ok) return { ok: false, message: SALE_ERRORS[r.error] };
  deliverSoon(member.school.id);
  refresh();
  return { ok: true };
}
