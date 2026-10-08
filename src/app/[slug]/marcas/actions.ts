"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { canManagePeople, canManageSettings, type SchoolRole } from "@/modules/schools/permissions";
import { recordPerformances, setTarget, type RecordResult } from "@/modules/sports/performances";
import { deliverSoon } from "../../deliver";
import { getActionContext } from "../action-context";

const staff = (roles: readonly SchoolRole[]) => canManagePeople(roles) || roles.includes("COACH");

export async function recordPerformancesAction(
  slug: string,
  input: {
    testId: string;
    recordedOn: string;
    context: "TRAINING" | "CONTROL" | "COMPETITION";
    timing: "MANUAL" | "ELECTRONIC" | null;
    entries: { athleteId: string; value: number; notes?: string | null }[];
  },
): Promise<RecordResult | { ok: false; error: "forbidden" | "invalid" }> {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false, error: "forbidden" };
  if (!Array.isArray(input.entries) || input.entries.length === 0) return { ok: false, error: "invalid" };
  const result = await recordPerformances(db, { ...member.ctx, slug }, input, {
    isManager: canManagePeople(member.roles),
  });
  if (result.ok) {
    deliverSoon(member.school.id);
    refresh();
  }
  return result;
}

export async function setTargetAction(
  slug: string,
  testId: string,
  ageCategoryId: string,
  value: number | null,
): Promise<{ ok: boolean }> {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return { ok: false };
  await setTarget(db, member.ctx, testId, ageCategoryId, value);
  refresh();
  return { ok: true };
}
