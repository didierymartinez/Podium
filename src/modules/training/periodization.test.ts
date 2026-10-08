import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { attendance, notifications, sessionReports, sessions } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { eq } from "drizzle-orm";
import { createPeriod, groupLoad, listPeriods, loadSpikes, notifyLoadSpikes, weekOf } from "./periodization";

describe("carga de entrenamiento", () => {
  it("detecta aumentos de más del 30 % semana a semana", () => {
    expect(
      loadSpikes([
        { week: "2026-09-28", load: 0 },
        { week: "2026-10-05", load: 1000 },
        { week: "2026-10-12", load: 1300 },
        { week: "2026-10-19", load: 1800 },
      ]),
    ).toEqual([{ week: "2026-10-19", load: 1800, previous: 1300, increase: 38 }]);
    expect(weekOf("2026-10-08")).toBe("2026-10-05");
  });
});

describe.skipIf(!testDatabaseUrl)("periodización y carga (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("periodos por grupo, carga por semana y alumno, y aviso al profesor", async () => {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía");
    const coach = { ...f.ctx, actorUserId: f.coachUser.id };
    expect(
      await createPeriod(
        conn.db,
        coach,
        {
          groupId: f.group.id,
          kind: "MACRO",
          phase: null,
          name: "Temporada 2026",
          objective: "Válida nacional",
          startsOn: "2026-01-15",
          endsOn: "2026-12-10",
          competitionId: null,
        },
        { isManager: false },
      ),
    ).toBeTruthy();
    expect((await listPeriods(conn.db, f.ctx.schoolId, f.group.id)).map((p) => p.period.name)).toEqual([
      "Temporada 2026",
    ]);

    // Dos semanas completas: la segunda con 50 % más de carga.
    const thisWeek = weekOf(f.today);
    const w1 = addDays(thisWeek, -14);
    const w2 = addDays(thisWeek, -7);
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      for (const [date, rpe] of [
        [w1, 5],
        [w2, 5],
        [addDays(w2, 2), 5],
      ] as const) {
        const [s] = await tx
          .insert(sessions)
          .values({
            schoolId: f.ctx.schoolId,
            groupId: f.group.id,
            date,
            startTime: "05:00",
            endTime: "06:00",
          })
          .returning();
        await tx.insert(sessionReports).values({
          schoolId: f.ctx.schoolId,
          sessionId: s.id,
          fulfilled: "YES",
          rpe,
          minutes: date === w1 ? 120 : 90,
        });
        await tx
          .insert(attendance)
          .values({ schoolId: f.ctx.schoolId, sessionId: s.id, athleteId: sofia, status: "PRESENT" });
      }
    });
    const load = await groupLoad(conn.db, f.ctx.schoolId, f.group.id, f.today, 3);
    expect(load.weeks.map((w) => w.load)).toEqual([600, 900, 0]);
    expect(load.spikes).toEqual([{ week: w2, load: 900, previous: 600, increase: 50 }]);
    expect(load.athletes).toEqual([
      expect.objectContaining({ id: sofia, total: 1500, spikes: [expect.objectContaining({ week: w2 })] }),
    ]);

    expect(await notifyLoadSpikes(conn.db, { id: f.ctx.schoolId, slug: f.school.slug }, f.today)).toBe(1);
    const inbox = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(notifications).where(eq(notifications.kind, "training.load_spike")),
    );
    expect(inbox.map((n) => n.userId)).toEqual([f.coachUser.id]);
  });
});
