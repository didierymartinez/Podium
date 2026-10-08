"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { canManageSettings } from "@/modules/schools/permissions";
import { updateSignupSettings } from "@/modules/signup/public-signup";
import { getActionContext } from "../action-context";

export async function updateSignupAction(slug: string, input: { enabled: boolean; intro: string }) {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return { ok: false };
  await updateSignupSettings(db, member.ctx, {
    enabled: Boolean(input.enabled),
    intro: String(input.intro ?? ""),
  });
  refresh();
  return { ok: true };
}
