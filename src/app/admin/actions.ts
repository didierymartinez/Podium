"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { requirePlatformAdmin } from "@/modules/auth/session";
import { SUPPORT_COOKIE, SUPPORT_MAX_AGE_SECONDS, signSupportToken } from "@/modules/auth/session-token";
import {
  activatePlanManually,
  extendTrial,
  logSupportAccess,
  setCoupon,
  suspendSchool,
  unsuspendSchool,
} from "@/modules/platform/console";

export type AdminState = { ok?: boolean; message?: string };

const done = (message: string): AdminState => {
  refresh();
  return { ok: true, message };
};

export async function extendTrialAction(
  schoolId: string,
  _prev: AdminState,
  form: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const days = Number(form.get("days"));
  if (!Number.isInteger(days) || days < 1 || days > 90) return { ok: false, message: "Entre 1 y 90 días" };
  const ok = await extendTrial(db, admin, schoolId, days, new Date());
  return ok
    ? done(`Prueba extendida ${days} días`)
    : { ok: false, message: "Solo escuelas en prueba o solo lectura" };
}

export async function couponAction(schoolId: string, _prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const percent = Number(form.get("percent"));
  const until = String(form.get("until") ?? "") || null;
  if (!Number.isInteger(percent) || percent < 0 || percent > 100)
    return { ok: false, message: "Porcentaje inválido" };
  await setCoupon(db, admin, schoolId, { percent, until });
  return done(percent ? `Descuento de ${percent} % aplicado` : "Descuento retirado");
}

export async function activatePlanAction(
  schoolId: string,
  _prev: AdminState,
  form: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const interval = form.get("interval") === "ANNUAL" ? "ANNUAL" : "MONTHLY";
  const ok = await activatePlanManually(
    db,
    admin,
    schoolId,
    { planCode: String(form.get("planCode")), interval },
    new Date(),
  );
  return ok ? done("Plan activado") : { ok: false, message: "Plan inválido" };
}

export async function suspendAction(
  schoolId: string,
  _prev: AdminState,
  form: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, message: "Escribe el motivo" };
  await suspendSchool(db, admin, schoolId, reason, new Date());
  return done("Escuela suspendida");
}

export async function unsuspendAction(schoolId: string): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  await unsuspendSchool(db, admin, schoolId);
  return done("Escuela reactivada");
}

/** "Entrar como" en solo lectura: motivo obligatorio, 30 minutos, auditado en la escuela. */
export async function enterSupportAction(
  schoolId: string,
  _prev: AdminState,
  form: FormData,
): Promise<AdminState> {
  const admin = await requirePlatformAdmin();
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, message: "El motivo es obligatorio" };
  const slug = await logSupportAccess(db, admin, schoolId, reason);
  if (!slug) return { ok: false, message: "Escuela no encontrada" };
  const token = await signSupportToken(
    { adminUserId: admin.id, schoolId, reason },
    serverEnv().SESSION_SECRET,
  );
  (await cookies()).set(SUPPORT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SUPPORT_MAX_AGE_SECONDS,
  });
  redirect(`/${slug}`);
}

export async function exitSupportAction(schoolId: string) {
  (await cookies()).delete(SUPPORT_COOKIE);
  redirect(`/admin/escuelas/${schoolId}`);
}
