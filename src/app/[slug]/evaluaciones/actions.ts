"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { canManagePeople, canManageSettings, type SchoolRole } from "@/modules/schools/permissions";
import {
  addCriterion,
  approvePromotion,
  evaluateAthlete,
  rejectPromotion,
  removeCriterion,
  type EvaluateResult,
  type ReviewResult,
} from "@/modules/sports/evaluations";
import { awardBadgesSoon, deliverSoon } from "../../deliver";
import { getActionContext } from "../action-context";

const staff = (roles: readonly SchoolRole[]) => canManagePeople(roles) || roles.includes("COACH");

export async function evaluateAction(
  slug: string,
  input: {
    athleteId: string;
    evaluatedOn: string;
    scores: { criterionId: string; score: number }[];
    strengths: string;
    improvements: string;
    comment: string;
  },
): Promise<EvaluateResult | { ok: false; error: "forbidden" | "invalid" }> {
  const member = await getActionContext(slug, staff);
  if (!member) return { ok: false, error: "forbidden" };
  if (!Array.isArray(input.scores) || input.scores.length === 0) return { ok: false, error: "invalid" };
  const result = await evaluateAthlete(db, { ...member.ctx, slug }, input, {
    isManager: canManagePeople(member.roles),
  });
  if (result.ok) {
    deliverSoon(member.school.id);
    refresh();
  }
  return result;
}

export async function reviewPromotionAction(
  slug: string,
  evaluationId: string,
  decision: "approve" | "reject",
): Promise<ReviewResult | { ok: false; error: "forbidden" }> {
  const member = await getActionContext(slug, canManagePeople);
  if (!member) return { ok: false, error: "forbidden" };
  const ctx = { ...member.ctx, slug };
  const result =
    decision === "approve"
      ? await approvePromotion(db, ctx, evaluationId, todayIn(member.school.timezone))
      : (await rejectPromotion(db, ctx, evaluationId))
        ? { ok: true as const, levelName: "", suggestedGroups: [] }
        : { ok: false as const, error: "not_pending" as const };
  if (result.ok) {
    deliverSoon(member.school.id);
    if (result.athleteId) awardBadgesSoon(member.school, [result.athleteId]);
    refresh();
  }
  return result;
}

export async function addCriterionAction(slug: string, levelId: string, name: string) {
  const member = await getActionContext(slug, canManageSettings);
  if (!member || name.trim().length < 3) return { ok: false };
  const ok = await addCriterion(db, member.ctx, levelId, name);
  refresh();
  return { ok };
}

export async function removeCriterionAction(slug: string, criterionId: string) {
  const member = await getActionContext(slug, canManageSettings);
  if (!member) return { ok: false };
  await removeCriterion(db, member.ctx, criterionId);
  refresh();
  return { ok: true };
}
