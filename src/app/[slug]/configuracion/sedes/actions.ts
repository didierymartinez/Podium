"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { canManageSettings } from "@/modules/schools/permissions";
import { saveVenue, setVenueActive, venueSchema } from "@/modules/schools/venues";
import { getActionContext } from "../../action-context";

const ERRORS = {
  last_venue: "Debe quedar al menos una sede activa.",
  has_groups: "Mueve o archiva primero los grupos de esta sede.",
  not_found: "La sede no existe.",
} as const;

export async function saveVenueAction(
  slug: string,
  input: unknown,
  venueId?: string,
): Promise<{ ok: boolean; message?: string }> {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  const parsed = venueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const id = await saveVenue(db, member.ctx, parsed.data, venueId);
  refresh();
  return { ok: Boolean(id) };
}

export async function setVenueActiveAction(slug: string, venueId: string, active: boolean) {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return { ok: false, message: "No tienes permiso para esta acción." };
  const r = await setVenueActive(db, member.ctx, venueId, active);
  refresh();
  return r.ok ? { ok: true } : { ok: false, message: ERRORS[r.error] };
}
