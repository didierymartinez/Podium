"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { serverEnv } from "@/env";
import { todayIn } from "@/lib/dates";
import { validCheckInToken } from "@/modules/attendance/check-in";
import { readBillingPolicy } from "@/modules/billing/policy";
import {
  createMember,
  createPlan,
  gymCheckIn,
  memberSchema,
  planSchema,
  sellMembership,
  type CheckInResult,
} from "@/modules/gym/memberships";
import { canManagePeople } from "@/modules/schools/permissions";
import { deliverSoon } from "../../deliver";
import { getActionContext } from "../action-context";

type Result = { ok: boolean; message?: string };
const FORBIDDEN: Result = { ok: false, message: "No tienes permiso para esta acción." };

export async function createPlanAction(slug: string, input: unknown): Promise<Result> {
  const m = await getActionContext(slug, canManagePeople);
  if (!m) return FORBIDDEN;
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa el plan." };
  const r = await createPlan(db, m.ctx, parsed.data);
  refresh();
  return r.ok
    ? { ok: true, message: "Plan creado." }
    : { ok: false, message: "Ya existe un plan con ese nombre." };
}

export async function createMemberAction(slug: string, input: unknown): Promise<Result> {
  const m = await getActionContext(slug, canManagePeople);
  if (!m) return FORBIDDEN;
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  await createMember(db, m.ctx, parsed.data, todayIn(m.school.timezone));
  refresh();
  return { ok: true, message: "Socio creado. Véndele una membresía." };
}

export async function sellAction(slug: string, athleteId: string, planId: string): Promise<Result> {
  const m = await getActionContext(slug, canManagePeople);
  if (!m) return FORBIDDEN;
  const r = await sellMembership(
    db,
    { ...m.ctx, slug },
    { athleteId, planId },
    todayIn(m.school.timezone),
    readBillingPolicy(m.school.settings.billing),
  );
  if (!r.ok)
    return {
      ok: false,
      message: r.error === "no_payer" ? "El socio no tiene responsable de pago." : "Elige el plan.",
    };
  deliverSoon(m.school.id);
  refresh();
  return { ok: true, message: `Membresía del ${r.startsOn} al ${r.endsOn}.` };
}

const describe = (r: CheckInResult) =>
  r.ok
    ? `${r.already ? "Ya había ingresado hoy" : "Ingreso registrado"} · ${r.membership.planName}${
        r.membership.visitsLeft !== null
          ? ` · quedan ${r.membership.visitsLeft} visitas`
          : ` · vence el ${r.membership.endsOn}`
      }`
    : r.error === "no_membership"
      ? "No tiene una membresía vigente. Ofrécele renovar."
      : "Socio no encontrado.";

export async function receptionCheckInAction(slug: string, athleteId: string): Promise<Result> {
  const m = await getActionContext(slug, canManagePeople);
  if (!m) return FORBIDDEN;
  const r = await gymCheckIn(db, m.ctx, athleteId, todayIn(m.school.timezone), "reception");
  refresh();
  return { ok: r.ok, message: describe(r) };
}

/** El socio registra su ingreso escaneando el QR del gimnasio (solo para sí mismo, por RLS). */
export async function selfCheckInAction(slug: string, token: string, athleteId: string): Promise<Result> {
  const m = await getActionContext(slug, () => true, { allowReadOnly: true });
  if (!m || !validCheckInToken(serverEnv().SESSION_SECRET, `gym:${m.school.id}`, token)) return FORBIDDEN;
  const r = await asPortalUser(m.user.id, () =>
    gymCheckIn(
      db,
      { schoolId: m.school.id, actorUserId: m.user.id },
      athleteId,
      todayIn(m.school.timezone),
      "self",
    ),
  );
  refresh();
  return { ok: r.ok, message: describe(r) };
}
