"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { updateBadgeSettings } from "@/modules/badges/badges";
import { BADGE_CODES, type BadgeCode } from "@/modules/badges/labels";
import { canManageSettings } from "@/modules/schools/permissions";
import { getActionContext } from "../../action-context";

export async function updateBadgeSettingsAction(slug: string, disabled: string[]) {
  const member = await getActionContext(slug, canManageSettings);
  if (!member || !Array.isArray(disabled)) return { ok: false };
  await updateBadgeSettings(
    db,
    member.ctx,
    disabled.filter((d): d is BadgeCode => (BADGE_CODES as string[]).includes(d)),
  );
  refresh();
  return { ok: true };
}
