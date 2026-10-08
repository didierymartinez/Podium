import { eq } from "drizzle-orm";
import { runInTenant } from "@/db/rls";
import { coaches, disciplines } from "@/db/schema";
import { todayIn } from "@/lib/dates";
import { createAthlete } from "@/modules/athletes/athletes";
import { athleteSchema, guardianSchema } from "@/modules/athletes/schemas";
import { createFeePlan } from "@/modules/billing/fee-plans";
import { coachSchema, createCoach } from "@/modules/coaches/coaches";
import { createGroup, type GroupInput } from "@/modules/groups/groups";
import { createSchool } from "@/modules/schools/create-school";
import { createTestUser, type connectTestDb } from "./db";

type Db = ReturnType<typeof connectTestDb>["db"];
export const TZ = "America/Bogota";
export const randomMobile = (prefix = "31") => `${prefix}${Math.floor(1e7 + Math.random() * 9e7)}`;

/** Escuela con tarifa, profesor (con cuenta) y un grupo de lunes a domingo. */
export async function schoolFixture(db: Db, name = "Club Prueba") {
  const owner = await createTestUser(db, "owner");
  const created = await createSchool(db, owner.id, {
    name,
    slug: `t-${crypto.randomUUID().slice(0, 8)}`,
    city: "Medellín",
    discipline: "speed",
    estimatedStudents: "1-30",
  });
  if (!created.ok) throw new Error("setup");
  const ctx = { schoolId: created.schoolId, actorUserId: owner.id };
  const school = { id: created.schoolId, slug: created.slug, timezone: TZ };
  const today = todayIn(TZ);
  const [discipline] = await runInTenant(db, { schoolId: ctx.schoolId }, (tx) =>
    tx.select().from(disciplines),
  );
  const plan = await createFeePlan(db, ctx, { name: "Plan", description: null, monthlyAmount: 100000 });
  const coach = await createCoach(
    db,
    ctx,
    coachSchema.parse({
      firstName: "Juan",
      lastName: "Pérez",
      documentType: null,
      documentNumber: "",
      phone: randomMobile(),
      email: "",
      specialty: "",
      hiredOn: "",
    }),
  );
  if (!coach.ok) throw new Error("coach");
  const coachUser = await createTestUser(db, "coach");
  await runInTenant(db, { schoolId: ctx.schoolId }, (tx) =>
    tx.update(coaches).set({ userId: coachUser.id }).where(eq(coaches.id, coach.coachId)),
  );
  const groupInput: GroupInput = {
    name: "Iniciación",
    disciplineId: discipline.id,
    levelId: null,
    capacity: 10,
    defaultFeePlanId: plan.id,
    color: "#2f6bff",
    schedule: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "16:00", endTime: "18:00" })),
    headCoachId: coach.coachId,
  };
  const group = await createGroup(db, ctx, groupInput);

  async function athlete(
    firstName: string,
    opts: {
      groupId?: string;
      status?: "ACTIVE" | "PRE_ENROLLED";
      guardianPhone?: string;
      birthDate?: string;
      feePlanId?: string;
      startDate?: string;
    } = {},
  ) {
    const result = await createAthlete(db, ctx, {
      athlete: athleteSchema.parse({
        firstName,
        lastName: "Gómez",
        documentType: null,
        documentNumber: "",
        birthDate: opts.birthDate ?? `2015-${today.slice(5)}`,
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
          phone: opts.guardianPhone ?? randomMobile("30"),
          email: "",
        }),
        relationship: "MOTHER",
      },
      enrollment: {
        groupId: opts.groupId ?? group.id,
        feePlanId: opts.feePlanId ?? plan.id,
        startDate: opts.startDate ?? today,
        status: opts.status ?? "ACTIVE",
      },
      today,
    });
    if (!result.ok) throw new Error(`athlete: ${result.error}`);
    return result.athleteId;
  }

  return { owner, ctx, school, today, plan, coachId: coach.coachId, coachUser, group, groupInput, athlete };
}
