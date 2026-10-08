import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { ageCategories, notifications, sportTests } from "@/db/schema";
import { createGroup } from "@/modules/groups/groups";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { athleteProgress, groupAthletes, recordPerformances, setTarget } from "./performances";

describe.skipIf(!testDatabaseUrl)("marcas y rendimiento (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("registra en lote, detecta PB, compara con la categoría y respeta los grupos del profesor", async () => {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía", { birthDate: "2015-03-14" });
    const ana = await f.athlete("Ana", { birthDate: "2015-06-01" });
    const other = await createGroup(conn.db, f.ctx, { ...f.groupInput, name: "Otro", headCoachId: null });
    const ajeno = await f.athlete("Ajeno", { groupId: other.id });
    const [sprint] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(sportTests).where(eq(sportTests.name, "500 m sprint")),
    );
    const ctx = { ...f.ctx, slug: f.school.slug };
    const base = { testId: sprint.id, context: "CONTROL" as const, timing: "MANUAL" as const };

    expect((await groupAthletes(conn.db, f.ctx.schoolId, f.group.id)).map((a) => a.firstName)).toEqual([
      "Ana",
      "Sofía",
    ]);
    const first = await recordPerformances(
      conn.db,
      ctx,
      {
        ...base,
        recordedOn: "2026-09-01",
        entries: [
          { athleteId: sofia, value: 50 },
          { athleteId: ana, value: 48 },
        ],
      },
      { isManager: true },
    );
    expect(first).toEqual({ ok: true, saved: 2, personalBests: [] });

    // El profesor del grupo mejora la marca de Sofía: PB y aviso.
    const coachCtx = { ...ctx, actorUserId: f.coachUser.id };
    const second = await recordPerformances(
      conn.db,
      coachCtx,
      { ...base, recordedOn: "2026-10-01", entries: [{ athleteId: sofia, value: 47.5 }] },
      { isManager: false },
    );
    expect(second).toMatchObject({ ok: true, personalBests: [{ name: "Sofía Gómez", value: "47,50 s" }] });
    // Pero no puede registrar a un alumno de otro grupo.
    expect(
      await recordPerformances(
        conn.db,
        coachCtx,
        { ...base, recordedOn: "2026-10-01", entries: [{ athleteId: ajeno, value: 40 }] },
        { isManager: false },
      ),
    ).toEqual({ ok: false, error: "not_allowed" });

    const [infantil] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(ageCategories).where(eq(ageCategories.name, "Infantil")),
    );
    await setTarget(conn.db, f.ctx, sprint.id, infantil.id, 45);

    const progress = await athleteProgress(conn.db, f.ctx.schoolId, sofia, "2026-10-08");
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({
      best: 47.5,
      category: { name: "Infantil", athletes: 2, best: 47.5, average: 47.75 },
      target: { value: 45, progress: 95 },
    });
    expect(progress[0].marks.map((m) => m.value)).toEqual([50, 47.5]);

    const inbox = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(notifications).where(eq(notifications.kind, "performance.pb")),
    );
    expect(inbox).toHaveLength(0); // la familia del fixture no tiene cuenta: no hay a quién avisar
  });
});
