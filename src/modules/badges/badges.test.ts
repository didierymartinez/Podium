import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { attendance, sessions, sportTests } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { recordPerformances } from "@/modules/sports/performances";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import {
  awardBadges,
  fullYears,
  listBadges,
  longestStreak,
  readBadgeSettings,
  updateBadgeSettings,
} from "./badges";

describe("reglas de insignias", () => {
  it("racha: la ausencia corta y la excusa no cuenta", () => {
    expect(longestStreak(["PRESENT", "LATE", "EXCUSED", "PRESENT", "ABSENT", "PRESENT"])).toBe(3);
    expect(longestStreak([])).toBe(0);
  });
  it("años cumplidos", () => {
    expect(fullYears("2025-10-08", "2026-10-08")).toBe(1);
    expect(fullYears("2025-10-09", "2026-10-08")).toBe(0);
  });
  it("lee la configuración ignorando códigos desconocidos", () => {
    expect(readBadgeSettings({ disabled: ["STREAK", "OTRA"] })).toEqual({ disabled: ["STREAK"] });
    expect(readBadgeSettings(undefined)).toEqual({ disabled: [] });
  });
});

describe.skipIf(!testDatabaseUrl)("insignias (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("otorga racha, récord personal y aniversario una sola vez y respeta las desactivadas", async () => {
    const f = await schoolFixture(conn.db);
    const school = { id: f.ctx.schoolId, slug: f.school.slug };
    const sofia = await f.athlete("Sofía", { startDate: addDays(f.today, -400) });
    const ana = await f.athlete("Ana");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      const days = Array.from({ length: 11 }, (_, i) => addDays(f.today, -40 + i));
      const created = await tx
        .insert(sessions)
        .values(
          days.map((date) => ({
            schoolId: f.ctx.schoolId,
            groupId: f.group.id,
            date,
            startTime: "05:00",
            endTime: "05:30",
          })),
        )
        .returning({ id: sessions.id });
      await tx.insert(attendance).values(
        created.flatMap((s, i) => [
          { schoolId: f.ctx.schoolId, sessionId: s.id, athleteId: sofia, status: "PRESENT" as const },
          {
            schoolId: f.ctx.schoolId,
            sessionId: s.id,
            athleteId: ana,
            status: i === 5 ? ("ABSENT" as const) : ("PRESENT" as const),
          },
        ]),
      );
    });
    const [sprint] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(sportTests).where(eq(sportTests.name, "500 m sprint")),
    );
    for (const [recordedOn, value] of [
      [addDays(f.today, -5), 50],
      [addDays(f.today, -1), 48],
    ] as const)
      await recordPerformances(
        conn.db,
        { ...f.ctx, slug: f.school.slug },
        {
          testId: sprint.id,
          recordedOn,
          context: "TRAINING",
          timing: "MANUAL",
          entries: [{ athleteId: sofia, value }],
        },
        { isManager: true },
      );

    expect(await awardBadges(conn.db, school, f.today)).toBe(3);
    expect(await awardBadges(conn.db, school, f.today)).toBe(0);
    expect((await listBadges(conn.db, f.ctx.schoolId, sofia)).map((b) => [b.badge, b.label]).sort()).toEqual([
      ["ANNIVERSARY", "1 año en la escuela"],
      ["PERSONAL_BEST", "Récord personal en 500 m sprint"],
      ["STREAK", "10 clases seguidas"],
    ]);
    expect(await listBadges(conn.db, f.ctx.schoolId, ana)).toEqual([]);

    // Con la racha desactivada, nadie más la gana.
    await updateBadgeSettings(conn.db, f.ctx, ["STREAK"]);
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      const rows = await tx.select().from(attendance).where(eq(attendance.athleteId, ana));
      for (const r of rows)
        await tx.update(attendance).set({ status: "PRESENT" }).where(eq(attendance.id, r.id));
    });
    expect(await awardBadges(conn.db, school, f.today, [ana])).toBe(0);
  });
});
