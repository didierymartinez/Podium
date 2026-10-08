import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { coaches, disciplines } from "@/db/schema";
import { addDays, instantOf, todayIn, weekdayIndex } from "@/lib/dates";
import { createAthlete } from "@/modules/athletes/athletes";
import { athleteSchema, guardianSchema } from "@/modules/athletes/schemas";
import { createFeePlan } from "@/modules/billing/fee-plans";
import { createClosure } from "@/modules/calendar/closures";
import { coachSchema, createCoach } from "@/modules/coaches/coaches";
import { createGroup, updateGroup, type GroupInput } from "@/modules/groups/groups";
import { createSchool } from "@/modules/schools/create-school";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { getSessionDetail, saveAttendance } from "./attendance";
import { cancelSession, listSessions, restoreSession, syncSessions } from "./sessions";

const TZ = "America/Bogota";
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "16:00", endTime: "18:00" }));

describe.skipIf(!testDatabaseUrl)("clases y asistencia (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  const today = todayIn(TZ);

  async function setup() {
    const owner = await createTestUser(conn.db, "owner");
    const created = await createSchool(conn.db, owner.id, {
      name: "Club Asistencia",
      slug: `asis-${crypto.randomUUID().slice(0, 8)}`,
      city: "Medellín",
      discipline: "speed",
      estimatedStudents: "1-30",
    });
    if (!created.ok) throw new Error("setup");
    const ctx = { schoolId: created.schoolId, actorUserId: owner.id };
    const school = { id: created.schoolId, timezone: TZ };
    const [discipline] = await runInTenant(conn.db, { schoolId: ctx.schoolId }, (tx) =>
      tx.select().from(disciplines),
    );
    const plan = await createFeePlan(conn.db, ctx, {
      name: "Plan",
      description: null,
      monthlyAmount: 100000,
    });
    const coach = await createCoach(
      conn.db,
      ctx,
      coachSchema.parse({
        firstName: "Juan",
        lastName: "Pérez",
        documentType: null,
        documentNumber: "",
        phone: `31${Math.floor(1e7 + Math.random() * 9e7)}`,
        email: "",
        specialty: "",
        hiredOn: "",
      }),
    );
    if (!coach.ok) throw new Error("coach");
    const coachUser = await createTestUser(conn.db, "coach");
    await runInTenant(conn.db, { schoolId: ctx.schoolId }, (tx) =>
      tx.update(coaches).set({ userId: coachUser.id }).where(eq(coaches.id, coach.coachId)),
    );
    const groupInput: GroupInput = {
      name: "Iniciación",
      disciplineId: discipline.id,
      levelId: null,
      capacity: 10,
      defaultFeePlanId: plan.id,
      color: "#2f6bff",
      schedule: everyDay,
      headCoachId: coach.coachId,
    };
    const group = await createGroup(conn.db, ctx, groupInput);
    const other = await createGroup(conn.db, ctx, { ...groupInput, name: "Avanzado", headCoachId: null });

    async function athlete(firstName: string, groupId: string, status: "ACTIVE" | "PRE_ENROLLED" = "ACTIVE") {
      const result = await createAthlete(conn.db, ctx, {
        athlete: athleteSchema.parse({
          firstName,
          lastName: "Gómez",
          documentType: null,
          documentNumber: "",
          birthDate: `2015-${today.slice(5)}`,
          sex: null,
          phone: "",
          email: "",
          healthInsurer: "",
          bloodType: null,
          medicalNotes: "",
          emergencyContactName: "",
          emergencyContactPhone: "",
          schoolName: "",
          notes: "",
        }),
        guardian: {
          ...guardianSchema.parse({
            firstName: "Laura",
            lastName: "Gómez",
            documentType: null,
            documentNumber: "",
            phone: `30${Math.floor(1e7 + Math.random() * 9e7)}`,
            email: "",
          }),
          relationship: "MOTHER",
        },
        enrollment: { groupId, feePlanId: plan.id, startDate: today, status },
        today,
      });
      if (!result.ok) throw new Error("athlete");
      return result.athleteId;
    }

    return { ctx, school, group, other, groupInput, coachUser, athlete };
  }

  it("genera clases todos los días (fines de semana y festivos incluidos), de forma idempotente", async () => {
    const { school, ctx } = await setup();
    const first = await syncSessions(conn.db, school, today);
    // 2 grupos × 56 días (hoy + 8 semanas); antes de crear el grupo no hay clases.
    expect(first).toEqual({ created: 112, removed: 0 });
    expect(await syncSessions(conn.db, school, today)).toEqual({ created: 0, removed: 0 });

    const list = await listSessions(conn.db, ctx.schoolId, { from: today, to: addDays(today, 6) });
    expect(new Set(list.map((s) => weekdayIndex(s.date))).size).toBe(7);
    expect(list[0]).toMatchObject({ startTime: "16:00", endTime: "18:00", status: "SCHEDULED", recorded: 0 });
  });

  it("los días sin clase de la escuela se omiten y el cambio de horario respeta lo registrado", async () => {
    const { school, ctx, group, groupInput, athlete } = await setup();
    const sofia = await athlete("Sofía", group.id);
    await syncSessions(conn.db, school, today);

    await createClosure(conn.db, ctx, {
      startDate: addDays(today, 7),
      endDate: addDays(today, 9),
      reason: "Vacaciones",
    });
    expect(await syncSessions(conn.db, school, today)).toEqual({ created: 0, removed: 6 });

    // Se toma asistencia en una clase futura y luego el grupo pasa a un solo día.
    const target = addDays(today, 2);
    const [future] = (await listSessions(conn.db, ctx.schoolId, { from: target, to: target })).filter(
      (s) => s.groupId === group.id,
    );
    const saved = await saveAttendance(conn.db, { ...ctx, timeZone: TZ, isManager: true }, future.id, {
      entries: [{ athleteId: sofia, status: "PRESENT" }],
    });
    expect(saved).toEqual({ ok: true, saved: 1 });

    const keepDay = weekdayIndex(addDays(today, 3));
    await updateGroup(conn.db, ctx, group.id, {
      ...groupInput,
      schedule: [{ weekday: keepDay, startTime: "16:00", endTime: "17:30" }],
    });
    await syncSessions(conn.db, school, today);
    const remaining = (
      await listSessions(conn.db, ctx.schoolId, { from: today, to: addDays(today, 55) })
    ).filter((s) => s.groupId === group.id);
    expect(remaining.find((s) => s.id === future.id)?.recorded).toBe(1);
    expect(remaining.filter((s) => s.id !== future.id).every((s) => weekdayIndex(s.date) === keepDay)).toBe(
      true,
    );
    expect(remaining.filter((s) => s.id !== future.id).every((s) => s.endTime === "17:30")).toBe(true);
  });

  it("el profesor del grupo registra en su ventana; nadie más; la lista se valida", async () => {
    const { school, ctx, group, other, coachUser, athlete } = await setup();
    const sofia = await athlete("Sofía", group.id);
    const nico = await athlete("Nicolás", group.id, "PRE_ENROLLED");
    const ajeno = await athlete("Pedro", other.id);
    await syncSessions(conn.db, school, today);

    const mine = await listSessions(
      conn.db,
      ctx.schoolId,
      { from: today, to: today },
      { coachUserId: coachUser.id },
    );
    expect(mine.map((s) => s.groupName)).toEqual(["Iniciación"]);
    const session = mine[0];

    const detail = await getSessionDetail(
      conn.db,
      { schoolId: ctx.schoolId, userId: coachUser.id },
      session.id,
    );
    expect(detail?.isGroupCoach).toBe(true);
    expect(detail?.coachNames).toEqual(["Juan Pérez"]);
    expect(detail?.roster.map((r) => [r.firstName, r.birthday, r.trial])).toEqual([
      ["Nicolás", true, true],
      ["Sofía", true, false],
    ]);

    const coachCtx = { schoolId: ctx.schoolId, actorUserId: coachUser.id, timeZone: TZ, isManager: false };
    const during = instantOf(today, "17:00", TZ);
    const entries = [
      { athleteId: sofia, status: "PRESENT" as const },
      { athleteId: nico, status: "EXCUSED" as const, excuseReason: "Cita médica" },
    ];
    expect(await saveAttendance(conn.db, coachCtx, session.id, { entries }, during)).toEqual({
      ok: true,
      saved: 2,
    });
    // Corrección dentro de la ventana: se actualiza, no se duplica.
    expect(
      await saveAttendance(
        conn.db,
        coachCtx,
        session.id,
        { entries: [{ athleteId: sofia, status: "LATE" }] },
        during,
      ),
    ).toEqual({ ok: true, saved: 1 });
    const after = await getSessionDetail(
      conn.db,
      { schoolId: ctx.schoolId, userId: coachUser.id },
      session.id,
    );
    expect(after?.roster.map((r) => [r.status, r.excuseReason])).toEqual([
      ["EXCUSED", "Cita médica"],
      ["LATE", null],
    ]);

    const late = new Date(instantOf(today, "18:00", TZ).getTime() + 49 * 3_600_000);
    expect(await saveAttendance(conn.db, coachCtx, session.id, { entries }, late)).toEqual({
      ok: false,
      error: "window_closed",
    });
    expect(
      await saveAttendance(conn.db, coachCtx, session.id, { entries }, instantOf(today, "14:30", TZ)),
    ).toEqual({ ok: false, error: "too_early" });
    const stranger = await createTestUser(conn.db, "otro");
    expect(
      await saveAttendance(
        conn.db,
        { ...coachCtx, actorUserId: stranger.id },
        session.id,
        { entries },
        during,
      ),
    ).toEqual({ ok: false, error: "not_coach" });
    expect(
      await saveAttendance(
        conn.db,
        coachCtx,
        session.id,
        { entries: [{ athleteId: ajeno, status: "PRESENT" }] },
        during,
      ),
    ).toEqual({ ok: false, error: "not_in_roster" });

    expect(await cancelSession(conn.db, ctx, session.id, "Lluvia")).toBe(true);
    expect(await saveAttendance(conn.db, coachCtx, session.id, { entries }, during)).toEqual({
      ok: false,
      error: "canceled",
    });
    expect(await restoreSession(conn.db, ctx, session.id)).toBe(true);
  });

  it("una escuela no ve ni registra clases de otra", async () => {
    const a = await setup();
    const b = await setup();
    await syncSessions(conn.db, a.school, today);
    const [session] = await listSessions(conn.db, a.ctx.schoolId, { from: today, to: today });
    expect(await listSessions(conn.db, b.ctx.schoolId, { from: today, to: today })).toHaveLength(0);
    expect(
      await getSessionDetail(conn.db, { schoolId: b.ctx.schoolId, userId: b.ctx.actorUserId }, session.id),
    ).toBe(null);
    expect(await cancelSession(conn.db, b.ctx, session.id, "Intento")).toBe(false);
    expect(
      await saveAttendance(conn.db, { ...b.ctx, timeZone: TZ, isManager: true }, session.id, {
        entries: [{ athleteId: crypto.randomUUID(), status: "PRESENT" }],
      }),
    ).toEqual({ ok: false, error: "not_found" });
  });
});
