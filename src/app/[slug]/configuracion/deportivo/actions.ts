"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import {
  deleteCategory,
  enableDiscipline,
  moveLevel,
  removeLevel,
  restoreLevel,
  saveCategory,
  saveLevel,
  saveTest,
  setDisciplineActive,
  setTestActive,
  type StructureResult,
} from "@/modules/sports/structure";
import { FORBIDDEN_STATE, getManagerContext } from "../context";

const FORBIDDEN: StructureResult = { ok: false, error: FORBIDDEN_STATE.message! };

async function run(
  slug: string,
  fn: (ctx: { schoolId: string; actorUserId: string }) => Promise<StructureResult>,
) {
  const m = await getManagerContext(slug);
  if (!m) return FORBIDDEN;
  const result = await fn(m.ctx);
  if (result.ok) refresh();
  return result;
}

export const enableDisciplineAction = async (slug: string, code: string) =>
  run(slug, (ctx) => enableDiscipline(db, ctx, code));
export const setDisciplineActiveAction = async (slug: string, id: string, active: boolean) =>
  run(slug, (ctx) => setDisciplineActive(db, ctx, id, active));
export const saveLevelAction = async (
  slug: string,
  input: { disciplineId: string; name: string; goal: string },
  id?: string,
) => run(slug, (ctx) => saveLevel(db, ctx, input, id));
export const moveLevelAction = async (slug: string, id: string, direction: "up" | "down") =>
  run(slug, (ctx) => moveLevel(db, ctx, id, direction));
export const removeLevelAction = async (slug: string, id: string) =>
  run(slug, (ctx) => removeLevel(db, ctx, id));
export const restoreLevelAction = async (slug: string, id: string) =>
  run(slug, (ctx) => restoreLevel(db, ctx, id));
export const saveCategoryAction = async (
  slug: string,
  input: { name: string; minAge: number | null; maxAge: number | null },
  id?: string,
) => run(slug, (ctx) => saveCategory(db, ctx, input, id));
export const deleteCategoryAction = async (slug: string, id: string) =>
  run(slug, (ctx) => deleteCategory(db, ctx, id));
export const saveTestAction = async (
  slug: string,
  input: {
    disciplineId: string | null;
    name: string;
    kind: "TIME" | "DISTANCE" | "POINTS" | "REPS" | "SCORE" | "POSITION";
    unit: string;
    lowerIsBetter: boolean;
    context: "TRACK" | "ROAD" | "FIELD";
  },
  id?: string,
) => run(slug, (ctx) => saveTest(db, ctx, input, id));
export const setTestActiveAction = async (slug: string, id: string, active: boolean) =>
  run(slug, (ctx) => setTestActive(db, ctx, id, active));
