import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asPortalUser } from "@/db/portal";
import { runInTenant } from "@/db/rls";
import { guardians, notifications } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { createGroup } from "@/modules/groups/groups";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { getSessionDetail, saveAttendance } from "./attendance";
import {
  addMakeup,
  makeupCandidates,
  removeMakeup,
  reportExcuse,
  sendExcuseNotice,
  upcomingForFamily,
  withdrawExcuse,
} from "./family";
import { clearInjury, listInjuries, reportInjury } from "./injuries";
import { listSessions, syncSessions } from "./sessions";

describe.skipIf(!testDatabaseUrl)("lesiones, excusas y reposiciones (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  async function setup() {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía");
    const other = await f.athlete("Ajeno");
    await syncSessions(conn.db, f.school, f.today);
    const sessions = await listSessions(conn.db, f.ctx.schoolId, { from: f.today, to: addDays(f.today, 3) });
    return { f, sofia, other, sessions };
  }

  it("la restricción médica aparece en la lista hasta el alta", async () => {
    const { f, sofia, sessions } = await setup();
    const tomorrow = sessions.find((s) => s.date === addDays(f.today, 1))!;
    const reported = await reportInjury(conn.db, f.ctx, sofia, {
      kind: "Esguince de tobillo",
      occurredOn: f.today,
      restriction: "No saltos por 2 semanas",
    });
    expect(reported.ok).toBe(true);
    const detail = await getSessionDetail(
      conn.db,
      { schoolId: f.ctx.schoolId, userId: f.owner.id },
      tomorrow.id,
    );
    expect(detail?.roster.find((r) => r.athleteId === sofia)?.restrictions).toEqual([
      "Esguince de tobillo: No saltos por 2 semanas",
    ]);
    const [injury] = await listInjuries(conn.db, f.ctx.schoolId, sofia);
    await clearInjury(conn.db, f.ctx, injury.id, f.today);
    const after = await getSessionDetail(
      conn.db,
      { schoolId: f.ctx.schoolId, userId: f.owner.id },
      tomorrow.id,
    );
    expect(after?.roster.find((r) => r.athleteId === sofia)?.restrictions).toEqual([]);
    expect(
      (await reportInjury(conn.db, f.ctx, sofia, { kind: "x", occurredOn: "", restriction: "" })).ok,
    ).toBe(false);
  });

  it("el acudiente reporta excusa antes de la clase; el profesor puede corregirla", async () => {
    const { f, sofia, other, sessions } = await setup();
    const parent = await createTestUser(conn.db, "acudiente");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => {
      const [g] = await tx.select().from(guardians).orderBy(asc(guardians.createdAt)).limit(1);
      // El primer acudiente creado es el de Sofía.
      await tx.update(guardians).set({ userId: parent.id }).where(eq(guardians.id, g.id));
    });
    const tomorrow = sessions.find((s) => s.date === addDays(f.today, 1))!;
    const ctx = {
      schoolId: f.ctx.schoolId,
      userId: parent.id,
      timeZone: f.school.timezone,
      slug: f.school.slug,
    };
    const now = new Date();

    const upcoming = await asPortalUser(parent.id, () =>
      upcomingForFamily(conn.db, f.ctx.schoolId, [sofia, other], f.today, now, f.school.timezone),
    );
    expect([...upcoming.keys()]).toEqual([sofia]);

    // No puede excusar al hijo de otra familia.
    const foreign = await asPortalUser(parent.id, () =>
      reportExcuse(conn.db, ctx, { sessionId: tomorrow.id, athleteId: other, reason: "Viaje" }, now),
    );
    expect(foreign).toEqual({ ok: false, error: "not_found" });

    const excused = await asPortalUser(parent.id, () =>
      reportExcuse(conn.db, ctx, { sessionId: tomorrow.id, athleteId: sofia, reason: "Cita médica" }, now),
    );
    if (!excused.ok) throw new Error(excused.error);
    expect(await sendExcuseNotice(conn.db, f.ctx.schoolId, excused.notice)).toBe(1);
    const coachInbox = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(notifications).where(eq(notifications.userId, f.coachUser.id)),
    );
    expect(coachInbox[0].title).toMatch(/Sofía .* no asistirá/);

    let detail = await getSessionDetail(
      conn.db,
      { schoolId: f.ctx.schoolId, userId: f.owner.id },
      tomorrow.id,
    );
    expect(detail?.roster.find((r) => r.athleteId === sofia)).toMatchObject({
      status: "EXCUSED",
      excuseReason: "Cita médica",
      familyReported: true,
    });

    // La familia puede retirarla; vuelve a reportarla y el profesor la corrige.
    expect(
      await asPortalUser(parent.id, () =>
        withdrawExcuse(conn.db, ctx, { sessionId: tomorrow.id, athleteId: sofia }, now),
      ),
    ).toBe(true);
    await asPortalUser(parent.id, () =>
      reportExcuse(conn.db, ctx, { sessionId: tomorrow.id, athleteId: sofia, reason: "Viaje" }, now),
    );
    await saveAttendance(conn.db, { ...f.ctx, timeZone: f.school.timezone, isManager: true }, tomorrow.id, {
      entries: [{ athleteId: sofia, status: "PRESENT" }],
    });
    detail = await getSessionDetail(conn.db, { schoolId: f.ctx.schoolId, userId: f.owner.id }, tomorrow.id);
    expect(detail?.roster.find((r) => r.athleteId === sofia)).toMatchObject({
      status: "PRESENT",
      familyReported: false,
    });
    const late = await asPortalUser(parent.id, () =>
      reportExcuse(conn.db, ctx, { sessionId: tomorrow.id, athleteId: sofia, reason: "Otra" }, now),
    );
    expect(late).toEqual({ ok: false, error: "recorded" });

    // Clase que ya empezó.
    const started = await asPortalUser(parent.id, () =>
      reportExcuse(
        conn.db,
        ctx,
        { sessionId: tomorrow.id, athleteId: sofia, reason: "Tarde" },
        new Date(Date.now() + 3 * 86_400_000),
      ),
    );
    expect(started).toEqual({ ok: false, error: "started" });
  });

  it("reposición: un alumno de otro grupo se suma a la clase y su asistencia cuenta", async () => {
    const { f, sessions } = await setup();
    const advanced = await createGroup(conn.db, f.ctx, {
      ...f.groupInput,
      name: "Avanzado",
      headCoachId: null,
    });
    const mateo = await f.athlete("Mateo", { groupId: advanced.id });
    const tomorrow = sessions.find((s) => s.date === addDays(f.today, 1) && s.groupId === f.group.id)!;
    const candidates = await makeupCandidates(conn.db, f.ctx.schoolId, tomorrow.id);
    expect(candidates.map((c) => c.firstName)).toEqual(["Mateo"]);
    expect(await addMakeup(conn.db, f.ctx, tomorrow.id, mateo)).toBe(true);
    const detail = await getSessionDetail(
      conn.db,
      { schoolId: f.ctx.schoolId, userId: f.owner.id },
      tomorrow.id,
    );
    expect(detail?.selectedAthletes).toBe(false);
    expect(detail?.roster.find((r) => r.athleteId === mateo)?.makeup).toBe(true);
    expect(detail?.roster.length).toBe(3);
    const saved = await saveAttendance(
      conn.db,
      { ...f.ctx, timeZone: f.school.timezone, isManager: true },
      tomorrow.id,
      { entries: [{ athleteId: mateo, status: "PRESENT" }] },
    );
    expect(saved.ok).toBe(true);
    expect(await removeMakeup(conn.db, f.ctx, tomorrow.id, mateo)).toBe(false);
  });
});
