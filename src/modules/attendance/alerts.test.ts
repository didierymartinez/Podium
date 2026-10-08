import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { athletes, guardians } from "@/db/schema";
import { addDays, instantOf } from "@/lib/dates";
import { listDocumentTypes, recordDocument } from "@/modules/documents/documents";
import { diskStorage } from "@/lib/storage/local";
import { listGuardians } from "@/modules/athletes/guardians";
import { listNotifications } from "@/modules/notifications/notify";
import { coachSchema, createCoach } from "@/modules/coaches/coaches";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { randomMobile, schoolFixture, TZ } from "@/test/fixtures";
import {
  DEFAULT_ATTENDANCE_POLICY,
  atRiskAthletes,
  notifyAtRisk,
  remindMissingAttendance,
  riskReasons,
} from "./alerts";
import { attendanceStats, getSessionDetail, saveAttendance } from "./attendance";
import { createExtraSession, rescheduleSession, setSubstitute } from "./changes";
import { listSessions, syncSessions } from "./sessions";

describe("riesgo de deserción", () => {
  const policy = DEFAULT_ATTENDANCE_POLICY;
  const rec = (date: string, status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED") => ({ date, status });
  it("detecta racha de ausencias (las excusas no la cortan)", () => {
    expect(
      riskReasons(
        [
          rec("2026-10-08", "ABSENT"),
          rec("2026-10-07", "EXCUSED"),
          rec("2026-10-06", "ABSENT"),
          rec("2026-10-05", "ABSENT"),
        ],
        "2026-10-01",
        policy,
      ),
    ).toEqual([{ kind: "streak", absences: 3 }]);
    expect(
      riskReasons(
        [rec("2026-10-08", "ABSENT"), rec("2026-10-07", "PRESENT"), rec("2026-10-06", "ABSENT")],
        "2026-10-01",
        policy,
      ),
    ).toEqual([]);
  });
  it("detecta % bajo del mes con un mínimo de registros", () => {
    const month = [
      rec("2026-10-08", "PRESENT"),
      rec("2026-10-07", "ABSENT"),
      rec("2026-10-06", "ABSENT"),
      rec("2026-10-05", "PRESENT"),
      rec("2026-10-02", "ABSENT"),
    ];
    expect(riskReasons(month, "2026-10-01", policy)).toEqual([{ kind: "rate", rate: 40 }]);
    expect(riskReasons(month.slice(0, 3), "2026-10-01", policy)).toEqual([]);
  });
});

describe.skipIf(!testDatabaseUrl)("cambios de clase, indicadores y alertas (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("reprogramar, clase extra con citados y sustituto con permisos y avisos", async () => {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía");
    const tomas = await f.athlete("Tomás");
    const family = await createTestUser(conn.db, "familia");
    const sofiaGuardian = (await listGuardians(conn.db, f.ctx.schoolId)).find((g) =>
      g.athletes[0].name.startsWith("Sofía"),
    )!;
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.update(guardians).set({ userId: family.id }).where(eq(guardians.id, sofiaGuardian.id)),
    );
    await syncSessions(conn.db, f.school, f.today);
    const ctx = { ...f.ctx, slug: f.school.slug };
    const day = addDays(f.today, 3);
    const [original] = await listSessions(conn.db, f.ctx.schoolId, { from: day, to: day });

    // Reprogramar a la misma hora de otra clase del grupo: choque.
    expect(
      await rescheduleSession(conn.db, ctx, original.id, {
        date: addDays(day, 1),
        startTime: "16:00",
        endTime: "18:00",
        reason: null,
      }),
    ).toEqual({ ok: false, error: "slot_taken" });
    const moved = await rescheduleSession(conn.db, ctx, original.id, {
      date: addDays(day, 1),
      startTime: "08:00",
      endTime: "10:00",
      reason: null,
    });
    if (!moved.ok) throw new Error("reschedule");
    const detail = await getSessionDetail(
      conn.db,
      { schoolId: f.ctx.schoolId, userId: f.owner.id },
      moved.sessionId,
    );
    expect(detail).toMatchObject({
      source: "EXTRA",
      rescheduledFrom: { id: original.id },
      startTime: "08:00",
    });
    const old = await getSessionDetail(
      conn.db,
      { schoolId: f.ctx.schoolId, userId: f.owner.id },
      original.id,
    );
    expect(old).toMatchObject({ status: "CANCELED", rescheduledTo: { id: moved.sessionId } });
    // La sincronización no revive la clase original ni borra la nueva.
    await syncSessions(conn.db, f.school, f.today);
    const sameDay = await listSessions(conn.db, f.ctx.schoolId, { from: day, to: day });
    expect(sameDay.find((s) => s.id === original.id)?.status).toBe("CANCELED");
    expect((await listNotifications(conn.db, f.ctx.schoolId, family.id))[0]).toMatchObject({
      kind: "session.rescheduled",
    });

    // Clase extra solo para Tomás.
    const extra = await createExtraSession(conn.db, ctx, {
      groupId: f.group.id,
      date: day,
      startTime: "06:00",
      endTime: "07:00",
      note: "Preparación de torneo",
      athleteIds: [tomas],
    });
    if (!extra.ok) throw new Error("extra");
    const extraDetail = await getSessionDetail(
      conn.db,
      { schoolId: f.ctx.schoolId, userId: f.owner.id },
      extra.sessionId,
    );
    expect(extraDetail?.roster.map((r) => r.firstName)).toEqual(["Tomás"]);
    expect(extraDetail?.selectedAthletes).toBe(true);
    // Sofía no está citada: su familia no recibe aviso de esta clase.
    expect((await listNotifications(conn.db, f.ctx.schoolId, family.id)).map((n) => n.kind)).not.toContain(
      "session.extra",
    );
    expect(
      await saveAttendance(conn.db, { ...f.ctx, timeZone: TZ, isManager: true }, extra.sessionId, {
        entries: [{ athleteId: sofia, status: "PRESENT" }],
      }),
    ).toEqual({ ok: false, error: "not_in_roster" });

    // Sustituto: otro profesor con cuenta ve la clase y puede registrar.
    const sub = await createCoach(
      conn.db,
      f.ctx,
      coachSchema.parse({
        firstName: "Ana",
        lastName: "Ruiz",
        documentType: null,
        documentNumber: "",
        phone: randomMobile(),
        email: "",
        specialty: "",
        hiredOn: "",
      }),
    );
    if (!sub.ok) throw new Error("coach");
    const subUser = await createTestUser(conn.db, "sustituta");
    const { coaches } = await import("@/db/schema");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.update(coaches).set({ userId: subUser.id }).where(eq(coaches.id, sub.coachId)),
    );
    const todaySession = (await listSessions(conn.db, f.ctx.schoolId, { from: f.today, to: f.today }))[0];
    expect(
      await listSessions(
        conn.db,
        f.ctx.schoolId,
        { from: f.today, to: f.today },
        { coachUserId: subUser.id },
      ),
    ).toEqual([]);
    expect(await setSubstitute(conn.db, ctx, todaySession.id, sub.coachId)).toBe(true);
    const subList = await listSessions(
      conn.db,
      f.ctx.schoolId,
      { from: f.today, to: f.today },
      { coachUserId: subUser.id },
    );
    expect(subList.map((s) => [s.id, s.substitute])).toEqual([[todaySession.id, true]]);
    expect(
      await saveAttendance(
        conn.db,
        { schoolId: f.ctx.schoolId, actorUserId: subUser.id, timeZone: TZ, isManager: false },
        todaySession.id,
        { entries: [{ athleteId: sofia, status: "PRESENT" }] },
        instantOf(f.today, "16:30", TZ),
      ),
    ).toEqual({ ok: true, saved: 1 });
    expect((await listNotifications(conn.db, f.ctx.schoolId, subUser.id))[0]).toMatchObject({
      kind: "session.substitute",
    });
  });

  it("indicadores de la lista, estadísticas, riesgo y recordatorio sin duplicar avisos", async () => {
    const f = await schoolFixture(conn.db);
    const sofia = await f.athlete("Sofía");
    const tomas = await f.athlete("Tomás");
    await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.update(athletes).set({ medicalNotesEncrypted: "x" }).where(eq(athletes.id, tomas)),
    );
    const [medical, consent] = await listDocumentTypes(conn.db, f.ctx.schoolId);
    const store = diskStorage({ dir: "/tmp/podium-unused", secret: "x" });
    await recordDocument(
      conn.db,
      store,
      f.ctx,
      sofia,
      { documentTypeId: medical.id, issuedOn: addDays(f.today, -400), notes: null, fileId: null },
      f.today,
    );
    await recordDocument(
      conn.db,
      store,
      f.ctx,
      sofia,
      { documentTypeId: consent.id, issuedOn: f.today, notes: null, fileId: null },
      f.today,
    );

    await syncSessions(conn.db, f.school, f.today);
    const [today] = await listSessions(conn.db, f.ctx.schoolId, { from: f.today, to: f.today });
    const detail = await getSessionDetail(
      conn.db,
      { schoolId: f.ctx.schoolId, userId: f.owner.id },
      today.id,
    );
    expect(detail?.roster.map((r) => [r.firstName, r.medicalNote, r.documentIssue])).toEqual([
      ["Sofía", false, "expired"],
      ["Tomás", true, "missing"],
    ]);

    // Tres clases extra en los días previos (el grupo se creó hoy) con Tomás ausente y Sofía presente.
    const ctx = { ...f.ctx, slug: f.school.slug };
    const manager = { ...f.ctx, timeZone: TZ, isManager: true };
    for (let i = 1; i <= 3; i++) {
      const extra = await createExtraSession(conn.db, ctx, {
        groupId: f.group.id,
        date: addDays(f.today, -i),
        startTime: "07:00",
        endTime: "08:00",
        note: null,
        athleteIds: [sofia, tomas],
      });
      if (!extra.ok) throw new Error("extra");
      await saveAttendance(conn.db, manager, extra.sessionId, {
        entries: [
          { athleteId: sofia, status: "PRESENT" },
          { athleteId: tomas, status: "ABSENT" },
        ],
      });
    }
    const stats = await attendanceStats(conn.db, f.ctx.schoolId, [sofia, tomas], {
      from: addDays(f.today, -30),
      to: f.today,
    });
    expect(stats.get(sofia)).toMatchObject({ present: 3, rate: 100 });
    expect(stats.get(tomas)).toMatchObject({ absent: 3, rate: 0 });

    const risk = await atRiskAthletes(conn.db, f.ctx.schoolId, f.today, DEFAULT_ATTENDANCE_POLICY);
    expect(risk.map((r) => [r.name, r.reasons[0].kind])).toEqual([["Tomás Gómez", "streak"]]);
    expect(await notifyAtRisk(conn.db, f.school, f.today, DEFAULT_ATTENDANCE_POLICY)).toBe(1);
    expect(await notifyAtRisk(conn.db, f.school, f.today, DEFAULT_ATTENDANCE_POLICY)).toBe(0);
    expect((await listNotifications(conn.db, f.ctx.schoolId, f.owner.id))[0].title).toBe(
      "Tomás Gómez podría estar desertando",
    );

    // Una clase de ayer quedó sin asistencia: se recuerda una sola vez al profesor del grupo.
    const forgotten = await createExtraSession(conn.db, ctx, {
      groupId: f.group.id,
      date: addDays(f.today, -1),
      startTime: "09:00",
      endTime: "10:00",
      note: null,
      athleteIds: [sofia],
    });
    if (!forgotten.ok) throw new Error("extra");
    const first = await remindMissingAttendance(conn.db, f.school, f.today);
    expect(first).toBe(1);
    expect(await remindMissingAttendance(conn.db, f.school, f.today)).toBe(0);
    expect((await listNotifications(conn.db, f.ctx.schoolId, f.coachUser.id))[0].kind).toBe(
      "attendance.reminder",
    );
  });
});
