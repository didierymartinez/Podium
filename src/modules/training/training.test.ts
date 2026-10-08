import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { sessions } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { syncSessions } from "@/modules/attendance/sessions";
import { createGroup } from "@/modules/groups/groups";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import {
  archiveExercise,
  assignPlan,
  createExercise,
  createPlan,
  duplicatePlan,
  listExercises,
  listPlans,
  saveSessionReport,
  sessionPlan,
} from "./training";

describe.skipIf(!testDatabaseUrl)("planificación de entrenamientos (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("biblioteca con filtros, planes, asignación al grupo, plan del día y registro post-sesión", async () => {
    const f = await schoolFixture(conn.db);
    const coach = { ...f.ctx, actorUserId: f.coachUser.id };

    // Biblioteca inicial de la plantilla con filtros.
    const all = await listExercises(conn.db, f.ctx.schoolId, f.owner.id);
    expect(all.length).toBe(40);
    const curve = await listExercises(conn.db, f.ctx.schoolId, f.owner.id, { q: "curva" });
    expect(curve.map((e) => e.name)).toEqual(["Cruce en curva con conos", "Curva a velocidad"]);
    expect((await listExercises(conn.db, f.ctx.schoolId, f.owner.id, { component: "COOLDOWN" })).length).toBe(
      3,
    );

    // Ejercicio personal: solo lo ve quien lo creó.
    const mine = await createExercise(conn.db, coach, {
      name: "Mi circuito",
      component: "PHYSICAL",
      disciplineId: null,
      levelIds: [],
      description: "",
      mediaUrl: "https://www.youtube.com/watch?v=abc",
      minutes: 10,
      materials: "",
      space: "",
      shared: false,
    });
    expect((await listExercises(conn.db, f.ctx.schoolId, f.coachUser.id, { q: "circuito" })).length).toBe(1);
    expect((await listExercises(conn.db, f.ctx.schoolId, f.owner.id, { q: "circuito" })).length).toBe(0);
    expect(await archiveExercise(conn.db, f.ctx, mine, { isManager: false })).toBe(false);
    expect(await archiveExercise(conn.db, coach, mine, { isManager: false })).toBe(true);

    const warm = all.find((e) => e.component === "WARMUP")!;
    const main = curve[0];
    const template = await createPlan(conn.db, f.ctx, {
      name: "Técnica de curva",
      objective: "Cruces sin perder la posición",
      isTemplate: true,
      items: [
        { exerciseId: main.id, title: main.name, phase: "MAIN", minutes: 30 },
        { exerciseId: warm.id, title: warm.name, phase: "WARMUP", minutes: 10 },
        { exerciseId: null, title: "Estiramientos", phase: "COOLDOWN", minutes: 10 },
      ],
    });
    const copy = await duplicatePlan(conn.db, f.ctx, template);
    expect(copy).toBeTruthy();

    const today = f.today;
    const tomorrow = addDays(today, 1);
    expect(
      await assignPlan(
        conn.db,
        f.ctx,
        { planId: template, groupId: f.group.id, dates: [addDays(today, -1)] },
        today,
        {
          isManager: true,
        },
      ),
    ).toEqual({ ok: false, error: "past" });
    expect(
      await assignPlan(
        conn.db,
        coach,
        { planId: template, groupId: f.group.id, dates: [today, tomorrow] },
        today,
        {
          isManager: false,
        },
      ),
    ).toEqual({ ok: true, assigned: 2 });
    // El profesor no asigna planes a grupos ajenos.
    const other = await createGroup(conn.db, f.ctx, { ...f.groupInput, name: "Otro", headCoachId: null });
    expect(
      await assignPlan(conn.db, coach, { planId: template, groupId: other.id, dates: [today] }, today, {
        isManager: false,
      }),
    ).toEqual({ ok: false, error: "not_allowed" });
    // Reasignar el mismo día reemplaza el plan.
    await assignPlan(conn.db, f.ctx, { planId: copy!, groupId: f.group.id, dates: [tomorrow] }, today, {
      isManager: true,
    });

    const plans = await listPlans(conn.db, f.ctx.schoolId, today);
    const t = plans.find((p) => p.id === template)!;
    expect(t.minutes).toBe(50);
    expect(t.items.map((i) => i.phase)).toEqual(["WARMUP", "MAIN", "COOLDOWN"]);
    expect(t.upcoming.map((a) => a.date)).toEqual([today]);

    await syncSessions(conn.db, f.school, today);
    const [session] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx
        .select()
        .from(sessions)
        .where(and(eq(sessions.groupId, f.group.id), eq(sessions.date, today))),
    );
    const day = await sessionPlan(conn.db, f.ctx.schoolId, session.id);
    expect(day?.plan?.name).toBe("Técnica de curva");
    expect(day?.items.map((i) => i.title)).toEqual([warm.name, main.name, "Estiramientos"]);
    expect(day?.duration).toBe(120);

    const report = { fulfilled: "PARTIAL" as const, rpe: 7, minutes: 110, notes: "Faltó tiempo" };
    expect(await saveSessionReport(conn.db, coach, session.id, report, { isManager: false })).toBe(true);
    expect(
      await saveSessionReport(conn.db, coach, session.id, { ...report, rpe: 6 }, { isManager: false }),
    ).toBe(true);
    const outsider = { ...f.ctx, actorUserId: f.owner.id };
    expect(await saveSessionReport(conn.db, outsider, session.id, report, { isManager: false })).toBe(false);
    expect((await sessionPlan(conn.db, f.ctx.schoolId, session.id))?.report).toMatchObject({
      fulfilled: "PARTIAL",
      rpe: 6,
      planId: template,
    });
  });
});
