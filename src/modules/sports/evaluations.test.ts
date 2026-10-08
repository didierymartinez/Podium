import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { levels } from "@/db/schema";
import { createGroup } from "@/modules/groups/groups";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { evaluationCertificate } from "./certificate";
import {
  approvePromotion,
  athleteEvaluations,
  certificateData,
  evaluateAthlete,
  evaluationForm,
  pendingPromotions,
  promotionResult,
  rejectPromotion,
} from "./evaluations";

describe("regla de promoción", () => {
  it("exige todos los criterios en 3 o más y promedio de 3,5", () => {
    expect(promotionResult([4, 4, 3, 4])).toEqual({ average: 3.75, passed: true });
    expect(promotionResult([5, 5, 2, 5])).toEqual({ average: 4.25, passed: false });
    expect(promotionResult([3, 3, 4, 3])).toEqual({ average: 3.25, passed: false });
  });
});

describe.skipIf(!testDatabaseUrl)("evaluaciones y promoción de nivel (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("evalúa con la rúbrica del nivel, propone, aprueba con certificado y respeta los grupos", async () => {
    const f = await schoolFixture(conn.db);
    const ctx = { ...f.ctx, slug: f.school.slug };
    const [inicio, basico] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx
        .select()
        .from(levels)
        .where(and(eq(levels.disciplineId, f.groupInput.disciplineId)))
        .orderBy(levels.position),
    );
    const group = await createGroup(conn.db, f.ctx, { ...f.groupInput, name: "Nivel 1", levelId: inicio.id });
    const next = await createGroup(conn.db, f.ctx, {
      ...f.groupInput,
      name: "Nivel 2",
      levelId: basico.id,
      headCoachId: null,
    });
    const sofia = await f.athlete("Sofía", { groupId: group.id });
    const sinNivel = await f.athlete("Ana");

    const form = await evaluationForm(conn.db, f.ctx.schoolId, sofia);
    expect(form?.level.id).toBe(inicio.id);
    expect(form!.criteria.length).toBeGreaterThan(2);
    expect(await evaluationForm(conn.db, f.ctx.schoolId, sinNivel)).toBeNull();

    const text = { strengths: "Buena postura", improvements: "Frenado", comment: "" };
    const scores = (value: number) => form!.criteria.map((c) => ({ criterionId: c.id, score: value }));

    // Incompleta: falta un criterio.
    expect(
      await evaluateAthlete(
        conn.db,
        ctx,
        { athleteId: sofia, evaluatedOn: "2026-10-01", scores: scores(4).slice(1), ...text },
        { isManager: true },
      ),
    ).toEqual({ ok: false, error: "incomplete" });

    // El profesor del grupo evalúa; no alcanza.
    const coachCtx = { ...ctx, actorUserId: f.coachUser.id };
    const low = await evaluateAthlete(
      conn.db,
      coachCtx,
      { athleteId: sofia, evaluatedOn: "2026-10-01", scores: scores(3), ...text },
      { isManager: false },
    );
    expect(low).toMatchObject({ ok: true, status: "NOT_PASSED", average: 3 });

    // Un alumno de otro grupo (sin el profesor) no se puede evaluar.
    const ajeno = await f.athlete("Ajeno", { groupId: next.id });
    expect(
      await evaluateAthlete(
        conn.db,
        coachCtx,
        { athleteId: ajeno, evaluatedOn: "2026-10-01", scores: scores(4), ...text },
        { isManager: false },
      ),
    ).toEqual({ ok: false, error: "not_allowed" });

    const high = await evaluateAthlete(
      conn.db,
      coachCtx,
      { athleteId: sofia, evaluatedOn: "2026-10-05", scores: scores(4), ...text },
      { isManager: false },
    );
    expect(high).toMatchObject({ ok: true, status: "PROPOSED", average: 4 });
    if (!high.ok) throw new Error("eval");
    expect(await certificateData(conn.db, f.ctx.schoolId, high.id)).toBeNull();

    const pending = await pendingPromotions(conn.db, f.ctx.schoolId);
    expect(pending.map((p) => [p.firstName, p.levelName, p.next?.name])).toEqual([
      ["Sofía", inicio.name, basico.name],
    ]);

    const approved = await approvePromotion(conn.db, ctx, high.id, "2026-10-06");
    expect(approved).toEqual({
      ok: true,
      levelName: basico.name,
      suggestedGroups: [{ id: next.id, name: "Nivel 2" }],
      athleteId: sofia,
    });
    expect(await approvePromotion(conn.db, ctx, high.id, "2026-10-06")).toEqual({
      ok: false,
      error: "not_pending",
    });

    const cert = await certificateData(conn.db, f.ctx.schoolId, high.id);
    expect(cert).toMatchObject({ athleteName: "Sofía Gómez", levelName: inicio.name, average: 4 });
    const store = { read: async () => Buffer.alloc(0) } as unknown as Parameters<
      typeof evaluationCertificate
    >[1];
    const pdf = await evaluationCertificate(conn.db, store, f.ctx.schoolId, high.id);
    expect(pdf?.bytes.subarray(0, 4).toString()).toBe("%PDF");

    const card = await athleteEvaluations(conn.db, f.ctx.schoolId, sofia);
    expect(card.current?.name).toBe(basico.name);
    expect(card.history.map((h) => h.levelName)).toEqual([basico.name]);
    expect(card.evaluations.map((e) => e.status)).toEqual(["APPROVED", "NOT_PASSED"]);
    expect(card.evaluations[0].scores).toHaveLength(form!.criteria.length);

    // Ahora se evalúa con la rúbrica del nuevo nivel; una propuesta rechazada no cambia el nivel.
    const form2 = await evaluationForm(conn.db, f.ctx.schoolId, sofia);
    expect(form2?.level.id).toBe(basico.id);
    const again = await evaluateAthlete(
      conn.db,
      ctx,
      {
        athleteId: sofia,
        evaluatedOn: "2026-10-07",
        scores: form2!.criteria.map((c) => ({ criterionId: c.id, score: 5 })),
        ...text,
      },
      { isManager: true },
    );
    if (!again.ok) throw new Error("eval2");
    expect(await rejectPromotion(conn.db, ctx, again.id)).toBe(true);
    expect((await athleteEvaluations(conn.db, f.ctx.schoolId, sofia)).current?.name).toBe(basico.name);
  });
});
