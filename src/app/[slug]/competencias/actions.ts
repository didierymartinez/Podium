"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { todayIn } from "@/lib/dates";
import { parseCsv, readFirstSheet } from "@/lib/xlsx";
import { readBillingPolicy } from "@/modules/billing/policy";
import {
  chargeEntry,
  competitionSchema,
  createCompetition,
  importResults,
  inviteAthletes,
  removeInvitation,
  respondToInvitation,
  resultSchema,
  saveResult,
  type InviteResult,
  type RespondResult,
} from "@/modules/competitions/competitions";
import { canManagePeople, type SchoolRole } from "@/modules/schools/permissions";
import { deliverSoon } from "../../deliver";
import { getActionContext } from "../action-context";

const staff = (roles: readonly SchoolRole[]) => canManagePeople(roles) || roles.includes("COACH");
const anyone = () => true;

export async function createCompetitionAction(
  slug: string,
  input: unknown,
): Promise<{ ok: false; message: string } | undefined> {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  const parsed = competitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const id = await createCompetition(db, member.ctx, parsed.data);
  redirect(`/${slug}/competencias/${id}`);
}

export async function inviteAction(
  slug: string,
  competitionId: string,
  input: { athleteIds: string[]; events: string[]; force: boolean },
): Promise<InviteResult | { ok: false; error: "forbidden" }> {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false, error: "forbidden" };
  const result = await inviteAthletes(
    db,
    { ...member.ctx, slug },
    competitionId,
    input,
    todayIn(member.school.timezone),
  );
  if (result.ok) {
    deliverSoon(member.school.id);
    refresh();
  }
  return result;
}

export async function removeInvitationAction(slug: string, entryId: string) {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false };
  const ok = await removeInvitation(db, member.ctx, entryId);
  refresh();
  return { ok };
}

export async function saveResultAction(slug: string, entryId: string, input: unknown) {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false };
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const ok = await saveResult(db, { ...member.ctx, slug }, entryId, parsed.data);
  if (ok) {
    deliverSoon(member.school.id);
    refresh();
  }
  return { ok };
}

export type ImportResultsState = { message?: string; tone?: "info" | "danger" };

export async function importResultsAction(
  slug: string,
  competitionId: string,
  _prev: ImportResultsState,
  form: FormData,
): Promise<ImportResultsState> {
  const member = await getActionContext(slug, staff);
  if (!member) return { tone: "danger", message: "No tienes permiso para esta acción." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { tone: "danger", message: "Elige un archivo." };
  if (file.size > 900 * 1024) return { tone: "danger", message: "El archivo pesa más de 900 KB." };
  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: string[][];
  try {
    rows = /\.csv$/i.test(file.name) ? parseCsv(buffer.toString("utf8")) : readFirstSheet(buffer);
  } catch {
    return { tone: "danger", message: "No pudimos leer el archivo. Súbelo en Excel (.xlsx) o CSV." };
  }
  const result = await importResults(db, { ...member.ctx, slug }, competitionId, rows.slice(0, 501));
  if (!result) return { tone: "danger", message: "La competencia no existe." };
  deliverSoon(member.school.id);
  refresh();
  return {
    tone: result.unmatched.length ? "danger" : "info",
    message:
      `${result.saved} resultados guardados.` +
      (result.unmatched.length ? ` Sin coincidencia: ${result.unmatched.join("; ")}.` : ""),
  };
}

/** Respuesta de la familia a una convocatoria (DEP-62); el cobro sale al aceptar (DEP-63). */
export async function respondInvitationAction(
  slug: string,
  entryId: string,
  input: { accept: boolean; extras: string[]; authorized: boolean },
): Promise<RespondResult | { ok: false; error: "forbidden" }> {
  const member = await getActionContext(slug, anyone, { allowReadOnly: true });
  if (!member) return { ok: false, error: "forbidden" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const today = todayIn(member.school.timezone);
  const result = await asPortalUser(member.user.id, () =>
    respondToInvitation(db, member.school.id, member.user.id, entryId, input, { ip, now: new Date(), today }),
  );
  if (result.ok) {
    await chargeEntry(
      db,
      { ...member.ctx, slug },
      entryId,
      today,
      readBillingPolicy(member.school.settings.billing),
    );
    deliverSoon(member.school.id);
    refresh();
  }
  return result;
}
