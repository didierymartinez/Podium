import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { disciplines, legalAcceptances } from "@/db/schema";
import { createAthlete } from "@/modules/athletes/athletes";
import { listGuardians } from "@/modules/athletes/guardians";
import { athleteSchema, guardianSchema } from "@/modules/athletes/schemas";
import { createFeePlan } from "@/modules/billing/fee-plans";
import { coachSchema, createCoach } from "@/modules/coaches/coaches";
import { createGroup } from "@/modules/groups/groups";
import { getMemberHome } from "@/modules/portal/member-home";
import { createSchool } from "@/modules/schools/create-school";
import { getMemberSchool } from "@/modules/schools/queries";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  invitationStates,
  listInvitations,
  openInvitation,
} from "./invitations";
import { hashInvitationToken, isWellFormedToken } from "./token";

describe("token de invitación", () => {
  it("es aleatorio, con formato de link y se guarda solo su hash", async () => {
    const { generateInvitationToken } = await import("./token");
    const a = generateInvitationToken();
    expect(isWellFormedToken(a)).toBe(true);
    expect(a).not.toBe(generateInvitationToken());
    expect(hashInvitationToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(isWellFormedToken("../etc/passwd")).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("invitaciones y profesores (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  async function setup() {
    const owner = await createTestUser(conn.db, "owner");
    const created = await createSchool(conn.db, owner.id, {
      name: "Club Invita",
      slug: `inv-${crypto.randomUUID().slice(0, 8)}`,
      city: "Cali",
      discipline: "speed",
      estimatedStudents: "1-30",
    });
    if (!created.ok) throw new Error("setup");
    const ctx = { schoolId: created.schoolId, actorUserId: owner.id };
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
        specialty: "Velocidad",
        hiredOn: "",
      }),
    );
    if (!coach.ok) throw new Error("coach");
    const group = await createGroup(conn.db, ctx, {
      name: "Iniciación",
      disciplineId: discipline.id,
      levelId: null,
      capacity: 10,
      defaultFeePlanId: plan.id,
      color: "#2f6bff",
      schedule: [{ weekday: 0, startTime: "16:00", endTime: "18:00" }],
      headCoachId: coach.coachId,
    });
    const athlete = await createAthlete(conn.db, ctx, {
      athlete: athleteSchema.parse({
        firstName: "Sofía",
        lastName: "Gómez",
        documentType: null,
        documentNumber: "",
        birthDate: "2015-03-14",
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
      enrollment: { groupId: group.id, feePlanId: plan.id, startDate: "2026-10-08", status: "ACTIVE" },
      today: "2026-10-08",
    });
    if (!athlete.ok) throw new Error("athlete");
    const [guardian] = await listGuardians(conn.db, ctx.schoolId);
    return { ctx, slug: created.slug, guardian, coachId: coach.coachId, groupId: group.id };
  }

  it("el acudiente abre el link, acepta y ve a su hija", async () => {
    const { ctx, slug, guardian } = await setup();
    const invite = await createInvitation(conn.db, ctx, { role: "GUARDIAN", guardianId: guardian.id });
    if (!invite.ok) throw new Error("invite");
    expect(invite.invitee.athleteNames).toEqual(["Sofía"]);

    const view = await openInvitation(conn.db, invite.token);
    expect(view.state).toBe("valid");
    if (view.state === "not_found") return;
    expect(view.school.slug).toBe(slug);
    expect(
      (await invitationStates(conn.db, ctx.schoolId, "GUARDIAN", [{ id: guardian.id, userId: null }])).get(
        guardian.id,
      ),
    ).toBe("opened");

    const laura = await createTestUser(conn.db, "laura");
    expect(await acceptInvitation(conn.db, invite.token, laura, { whatsapp: true, ip: "1.1.1.1" })).toEqual({
      ok: true,
      slug,
    });

    const member = await getMemberSchool(conn.db, slug, laura.id);
    expect(member?.roles).toEqual(["GUARDIAN"]);
    const home = await getMemberHome(conn.db, ctx.schoolId, laura.id);
    expect(home.athletes.map((a) => a.firstName)).toEqual(["Sofía"]);
    expect(home.athletes[0].enrollments[0].group.name).toBe("Iniciación");
    const consents = await conn.db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, laura.id));
    expect(consents.map((c) => c.document).sort()).toEqual(["SCHOOL_DATA", "WHATSAPP"]);

    // Un solo uso.
    const other = await createTestUser(conn.db, "otro");
    expect(await acceptInvitation(conn.db, invite.token, other, { whatsapp: false, ip: null })).toEqual({
      ok: false,
      error: "used",
    });
    // Ya tiene cuenta: no se puede volver a invitar.
    expect(await createInvitation(conn.db, ctx, { role: "GUARDIAN", guardianId: guardian.id })).toEqual({
      ok: false,
      error: "already_member",
    });
  });

  it("reenviar invalida el link anterior; cancelar y vencer funcionan", async () => {
    const { ctx, guardian } = await setup();
    const first = await createInvitation(conn.db, ctx, { role: "GUARDIAN", guardianId: guardian.id });
    const second = await createInvitation(conn.db, ctx, { role: "GUARDIAN", guardianId: guardian.id });
    if (!first.ok || !second.ok) throw new Error("invite");
    expect((await openInvitation(conn.db, first.token)).state).toBe("canceled");
    expect((await openInvitation(conn.db, second.token)).state).toBe("valid");

    const user = await createTestUser(conn.db, "u");
    const later = new Date(Date.now() + 8 * 86_400_000);
    expect(await acceptInvitation(conn.db, second.token, user, { whatsapp: false, ip: null }, later)).toEqual(
      {
        ok: false,
        error: "expired",
      },
    );

    const [listed] = await listInvitations(conn.db, ctx.schoolId);
    expect(await cancelInvitation(conn.db, ctx, listed.id)).toBe(true);
    expect((await openInvitation(conn.db, second.token)).state).toBe("canceled");
    expect((await openInvitation(conn.db, "x".repeat(43))).state).toBe("not_found");
  });

  it("el profesor acepta y ve sus grupos con alumnos; un miembro existente solo suma el rol", async () => {
    const { ctx, slug, coachId } = await setup();
    const invite = await createInvitation(conn.db, ctx, { role: "COACH", coachId });
    if (!invite.ok) throw new Error("invite");
    // El propietario acepta su propia invitación de profesor: se suma el rol.
    const owner = { id: ctx.actorUserId };
    expect((await acceptInvitation(conn.db, invite.token, owner, { whatsapp: false, ip: null })).ok).toBe(
      true,
    );
    expect((await getMemberSchool(conn.db, slug, owner.id))?.roles).toEqual(["OWNER", "COACH"]);
    const home = await getMemberHome(conn.db, ctx.schoolId, owner.id);
    expect(home.coachGroups[0].role).toBe("HEAD");
    expect(home.coachGroups[0].athletes.map((a) => a.name)).toEqual(["Sofía Gómez"]);
  });

  it("los links de una escuela no sirven para invitar a personas de otra", async () => {
    const a = await setup();
    const b = await setup();
    expect(await createInvitation(conn.db, b.ctx, { role: "GUARDIAN", guardianId: a.guardian.id })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await listInvitations(conn.db, b.ctx.schoolId)).toHaveLength(0);
  });
});
