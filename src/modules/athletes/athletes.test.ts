import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { athletes, disciplines, levels } from "@/db/schema";
import { createFeePlan } from "@/modules/billing/fee-plans";
import { createGroup, listGroups } from "@/modules/groups/groups";
import { createSchool } from "@/modules/schools/create-school";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import {
  addGuardianToAthlete,
  changeEnrollmentStatus,
  createAthlete,
  enrollAthlete,
  getAthlete,
  listAthletes,
  setPayer,
} from "./athletes";
import { listGuardians } from "./guardians";
import { athleteSchema, guardianSchema } from "./schemas";

const TODAY = "2026-10-08";

const athlete = (over: Record<string, unknown> = {}) =>
  athleteSchema.parse({
    firstName: "Sofía",
    lastName: "Restrepo",
    documentType: "TI",
    documentNumber: `1${Math.floor(Math.random() * 1e9)}`,
    birthDate: "2015-03-14",
    sex: "F",
    phone: "",
    email: "",
    healthInsurer: "Sura",
    bloodType: "O+",
    medicalNotes: "Asma leve",
    emergencyContactName: "",
    emergencyContactPhone: "",
    schoolName: "",
    notes: "",
    ...over,
  });

const guardian = (phone = "3001234567") => ({
  ...guardianSchema.parse({
    firstName: "Laura",
    lastName: "Gómez",
    documentType: "CC",
    documentNumber: "43123456",
    phone,
    email: "laura@example.com",
  }),
  relationship: "MOTHER" as const,
});

describe.skipIf(!testDatabaseUrl)("alumnos, acudientes, grupos y matrículas (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  async function setup(capacity = 2) {
    const owner = await createTestUser(conn.db, "owner");
    const created = await createSchool(conn.db, owner.id, {
      name: "Club Alumnos",
      slug: `alu-${crypto.randomUUID().slice(0, 8)}`,
      city: "Bogotá",
      discipline: "speed",
      estimatedStudents: "1-30",
    });
    if (!created.ok) throw new Error("setup");
    const ctx = { schoolId: created.schoolId, actorUserId: owner.id };
    const { disciplineId, levelId } = await runInTenant(conn.db, { schoolId: ctx.schoolId }, async (tx) => {
      const [d] = await tx.select().from(disciplines);
      const [l] = await tx.select().from(levels).where(eq(levels.position, 1));
      return { disciplineId: d.id, levelId: l.id };
    });
    const plan = await createFeePlan(conn.db, ctx, {
      name: "Iniciación",
      description: null,
      monthlyAmount: 120000,
    });
    const group = await createGroup(conn.db, ctx, {
      name: "Iniciación tarde",
      disciplineId,
      levelId,
      capacity,
      defaultFeePlanId: plan.id,
      color: "#2f6bff",
      schedule: [
        { weekday: 0, startTime: "16:00", endTime: "18:00" },
        { weekday: 2, startTime: "16:00", endTime: "18:00" },
      ],
    });
    const enrollment = { groupId: group.id, feePlanId: plan.id, startDate: TODAY, status: "ACTIVE" as const };
    return { ctx, plan, group, enrollment, disciplineId };
  }

  it("crea alumno con acudiente pagador y matrícula; cifra datos de salud", async () => {
    const { ctx, enrollment } = await setup();
    const result = await createAthlete(conn.db, ctx, {
      athlete: athlete(),
      guardian: guardian(),
      enrollment,
      today: TODAY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const detail = await getAthlete(conn.db, ctx.schoolId, result.athleteId);
    expect(detail?.athlete.medicalNotes).toBe("Asma leve");
    expect(detail?.guardians[0]).toMatchObject({ isPayer: true, relationship: "MOTHER" });
    expect(detail?.enrollments[0].enrollment.status).toBe("ACTIVE");

    const [raw] = await runInTenant(conn.db, { schoolId: ctx.schoolId }, (tx) =>
      tx.select().from(athletes).where(eq(athletes.id, result.athleteId)),
    );
    expect(raw.medicalNotesEncrypted).not.toContain("Asma");
  });

  it("hermanos comparten acudiente por celular", async () => {
    const { ctx, enrollment } = await setup(5);
    await createAthlete(conn.db, ctx, { athlete: athlete(), guardian: guardian(), enrollment, today: TODAY });
    await createAthlete(conn.db, ctx, {
      athlete: athlete({ firstName: "Tomás", birthDate: "2018-06-01" }),
      guardian: guardian(),
      enrollment,
      today: TODAY,
    });
    const list = await listGuardians(conn.db, ctx.schoolId);
    expect(list).toHaveLength(1);
    expect(list[0].athletes.map((a) => a.name).sort()).toEqual(["Sofía Restrepo", "Tomás Restrepo"]);
  });

  it("exige acudiente a menores, no a adultos", async () => {
    const { ctx } = await setup();
    expect(
      await createAthlete(conn.db, ctx, {
        athlete: athlete(),
        guardian: null,
        enrollment: null,
        today: TODAY,
      }),
    ).toEqual({
      ok: false,
      error: "guardian_required",
    });
    const adult = await createAthlete(conn.db, ctx, {
      athlete: athlete({ birthDate: "1990-01-01", documentType: "CC" }),
      guardian: null,
      enrollment: null,
      today: TODAY,
    });
    expect(adult.ok).toBe(true);
  });

  it("controla cupo, documento repetido y matrícula duplicada", async () => {
    const { ctx, enrollment, group } = await setup(1);
    const first = await createAthlete(conn.db, ctx, {
      athlete: athlete({ documentNumber: "1001" }),
      guardian: guardian(),
      enrollment,
      today: TODAY,
    });
    expect(first.ok).toBe(true);
    expect(
      await createAthlete(conn.db, ctx, {
        athlete: athlete({ documentNumber: "1001" }),
        guardian: guardian(),
        enrollment: null,
        today: TODAY,
      }),
    ).toEqual({ ok: false, error: "document_taken" });

    const second = await createAthlete(conn.db, ctx, {
      athlete: athlete(),
      guardian: guardian(),
      enrollment,
      today: TODAY,
    });
    expect(second).toEqual({ ok: false, error: "group_full" });
    // La transacción se revirtió: no quedó el alumno a medias.
    expect((await listAthletes(conn.db, ctx.schoolId, { status: "all" })).length).toBe(1);

    const overbooked = await createAthlete(conn.db, ctx, {
      athlete: athlete(),
      guardian: guardian(),
      enrollment: { ...enrollment, allowOverCapacity: true },
      today: TODAY,
    });
    expect(overbooked.ok).toBe(true);
    expect((await listGroups(conn.db, ctx.schoolId)).find((g) => g.id === group.id)?.enrolled).toBe(2);

    if (!first.ok) return;
    expect(
      await enrollAthlete(conn.db, ctx, first.athleteId, { ...enrollment, allowOverCapacity: true }),
    ).toEqual({
      ok: false,
      error: "already_enrolled",
    });
  });

  it("congela, retira y reactiva respetando transiciones; filtra la lista", async () => {
    const { ctx, enrollment } = await setup(5);
    const created = await createAthlete(conn.db, ctx, {
      athlete: athlete(),
      guardian: guardian(),
      enrollment,
      today: TODAY,
    });
    if (!created.ok) throw new Error("setup");
    const enrollmentId = (await getAthlete(conn.db, ctx.schoolId, created.athleteId))!.enrollments[0]
      .enrollment.id;

    expect(
      (
        await changeEnrollmentStatus(conn.db, ctx, enrollmentId, {
          to: "FROZEN",
          date: TODAY,
          frozenUntil: "2026-11-30",
        })
      ).ok,
    ).toBe(true);
    expect(
      await changeEnrollmentStatus(conn.db, ctx, enrollmentId, { to: "DISCARDED", date: TODAY }),
    ).toEqual({
      ok: false,
      error: "invalid_transition",
    });
    expect(
      (
        await changeEnrollmentStatus(conn.db, ctx, enrollmentId, {
          to: "WITHDRAWN",
          date: TODAY,
          reason: "ECONOMIC",
        })
      ).ok,
    ).toBe(true);
    expect(await listAthletes(conn.db, ctx.schoolId)).toHaveLength(0);
    expect(await listAthletes(conn.db, ctx.schoolId, { status: "withdrawn" })).toHaveLength(1);

    expect((await changeEnrollmentStatus(conn.db, ctx, enrollmentId, { to: "ACTIVE", date: TODAY })).ok).toBe(
      true,
    );
    const found = await listAthletes(conn.db, ctx.schoolId, { query: "sofía rest" });
    expect(found).toHaveLength(1);
    expect(found[0].enrollments[0].status).toBe("ACTIVE");
  });

  it("cambia el responsable de pago (siempre uno solo)", async () => {
    const { ctx } = await setup();
    const created = await createAthlete(conn.db, ctx, {
      athlete: athlete(),
      guardian: guardian(),
      enrollment: null,
      today: TODAY,
    });
    if (!created.ok) throw new Error("setup");
    const dad = await addGuardianToAthlete(conn.db, ctx, created.athleteId, {
      ...guardian("3109876543"),
      firstName: "Carlos",
      relationship: "FATHER",
      isPayer: false,
    });
    if (!dad.ok) throw new Error("dad");
    await setPayer(conn.db, ctx, created.athleteId, dad.guardianId);
    const detail = await getAthlete(conn.db, ctx.schoolId, created.athleteId);
    expect(detail?.guardians.filter((g) => g.isPayer).map((g) => g.guardian.firstName)).toEqual(["Carlos"]);
  });

  it("no permite usar grupos ni ver alumnos de otra escuela", async () => {
    const a = await setup();
    const b = await setup();
    const created = await createAthlete(conn.db, a.ctx, {
      athlete: athlete(),
      guardian: guardian(),
      enrollment: null,
      today: TODAY,
    });
    if (!created.ok) throw new Error("setup");

    expect(await getAthlete(conn.db, b.ctx.schoolId, created.athleteId)).toBeNull();
    expect(await listAthletes(conn.db, b.ctx.schoolId, { status: "all" })).toHaveLength(0);
    // Matricular en el grupo de B a un alumno de A desde A: referencia inválida.
    expect(await enrollAthlete(conn.db, a.ctx, created.athleteId, b.enrollment)).toEqual({
      ok: false,
      error: "invalid_reference",
    });
    // Crear un grupo en B usando la modalidad de A.
    await expect(
      createGroup(conn.db, b.ctx, {
        name: "Intruso",
        disciplineId: a.disciplineId,
        levelId: null,
        capacity: 5,
        defaultFeePlanId: null,
        color: "#2f6bff",
        schedule: [{ weekday: 1, startTime: "08:00", endTime: "09:00" }],
      }),
    ).rejects.toThrow(/no pertenecen/);
  });
});
