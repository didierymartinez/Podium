import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asPortalUser } from "@/db/portal";
import { runInTenant } from "@/db/rls";
import { attendance, guardians, sessions } from "@/db/schema";
import { instantOf } from "@/lib/dates";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { TZ, schoolFixture } from "@/test/fixtures";
import { checkIn, checkInCount, checkInToken, checkInView, validCheckInToken } from "./check-in";
import { syncSessions } from "./sessions";

describe("check-in: firma del link", () => {
  it("valida el token de cada clase", () => {
    const t = checkInToken("secreto", "sesion-1");
    expect(validCheckInToken("secreto", "sesion-1", t)).toBe(true);
    expect(validCheckInToken("secreto", "sesion-2", t)).toBe(false);
    expect(validCheckInToken("otro", "sesion-1", t)).toBe(false);
    expect(validCheckInToken("secreto", "sesion-1", null)).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("check-in con QR (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("la familia marca la llegada de sus hijos dentro de la ventana, sin pisar al profesor", async () => {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía");
    const otro = await f.athlete("Otro");
    const parent = await createTestUser(conn.db, "acudiente");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      const [first] = await tx.select().from(guardians).orderBy(asc(guardians.createdAt));
      await tx.update(guardians).set({ userId: parent.id }).where(eq(guardians.id, first.id));
    });
    await syncSessions(conn.db, f.school, f.today);
    const [session] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx
        .select()
        .from(sessions)
        .where(and(eq(sessions.groupId, f.group.id), eq(sessions.date, f.today))),
    );
    const at = (time: string) => instantOf(f.today, time, TZ);
    const ctx = { schoolId: f.ctx.schoolId, userId: parent.id, timeZone: TZ };
    const portal = <T>(fn: () => Promise<T>) => asPortalUser(parent.id, fn);

    const view = await portal(() => checkInView(conn.db, f.ctx.schoolId, session.id, TZ, at("15:40")));
    expect(view).toMatchObject({ ok: true, window: "open", athletes: [{ id: sofia, status: null }] });
    expect(await portal(() => checkIn(conn.db, ctx, session.id, [sofia], at("15:00")))).toEqual({
      ok: false,
      error: "early",
    });
    // No puede marcar a un alumno que no es suyo.
    expect(await portal(() => checkIn(conn.db, ctx, session.id, [otro], at("16:00")))).toEqual({
      ok: false,
      error: "not_in_roster",
    });
    expect(await portal(() => checkIn(conn.db, ctx, session.id, [sofia], at("16:20")))).toEqual({
      ok: true,
      checkedIn: 1,
      status: "LATE",
    });
    // Repetir no cambia nada; después de la clase ya no se puede.
    expect(await portal(() => checkIn(conn.db, ctx, session.id, [sofia], at("16:30")))).toMatchObject({
      ok: true,
      checkedIn: 0,
    });
    expect(await portal(() => checkIn(conn.db, ctx, session.id, [sofia], at("18:30")))).toEqual({
      ok: false,
      error: "closed",
    });
    const [mark] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(attendance).where(eq(attendance.athleteId, sofia)),
    );
    expect(mark).toMatchObject({ status: "LATE", recordedByUserId: parent.id });
    expect(await checkInCount(conn.db, f.ctx.schoolId, session.id)).toBe(1);
  });
});
