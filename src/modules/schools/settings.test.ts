import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { auditLogs, schools } from "@/db/schema";
import { createFeePlan, listFeePlans, setFeePlanActive, updateFeePlan } from "@/modules/billing/fee-plans";
import { DEFAULT_BILLING_POLICY, readBillingPolicy } from "@/modules/billing/policy";
import { updateBillingPolicy } from "@/modules/billing/settings";
import { connectTestDb, createTestUser, testDatabaseUrl } from "@/test/db";
import { createSchool } from "./create-school";
import { schoolProfileSchema, updateSchoolProfile } from "./profile";
import { getMemberSchool } from "./queries";
import { getSetupSteps } from "./setup-status";

describe("schoolProfileSchema", () => {
  const base = {
    name: "Club Patín Veloz",
    legalName: "",
    documentType: "NIT" as const,
    documentNumber: "800.197.268-4",
    phone: "300 123 4567",
    contactEmail: "",
    city: "Medellín",
    address: "",
    brandColor: "#2f6bff",
  };

  it("normaliza NIT, celular y campos vacíos", () => {
    const parsed = schoolProfileSchema.parse(base);
    expect(parsed).toMatchObject({
      documentNumber: "800197268-4",
      phone: "+573001234567",
      legalName: null,
      contactEmail: null,
    });
  });

  it("rechaza NIT con dígito de verificación incorrecto y celular inválido", () => {
    const result = schoolProfileSchema.safeParse({ ...base, documentNumber: "800197268-5", phone: "123" });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["documentNumber", "phone"]));
  });

  it("sin número de documento no guarda tipo", () => {
    expect(schoolProfileSchema.parse({ ...base, documentNumber: "" }).documentType).toBeNull();
  });
});

describe.skipIf(!testDatabaseUrl)("perfil, política y tarifas (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  async function newSchool() {
    const owner = await createTestUser(conn.db, "owner");
    const slug = `cfg-${crypto.randomUUID().slice(0, 8)}`;
    const result = await createSchool(conn.db, owner.id, {
      name: "Club Config",
      slug,
      city: "Cali",
      discipline: "speed",
      estimatedStudents: "1-30",
    });
    if (!result.ok) throw new Error("setup");
    return { owner, schoolId: result.schoolId, slug };
  }

  it("actualiza perfil y política sin perder otros settings, con auditoría", async () => {
    const { owner, schoolId, slug } = await newSchool();
    const ctx = { schoolId, actorUserId: owner.id };

    await updateSchoolProfile(
      conn.db,
      ctx,
      schoolProfileSchema.parse({
        name: "Club Config Renovado",
        legalName: "Club Deportivo Config",
        documentType: "NIT",
        documentNumber: "800197268",
        phone: "3001234567",
        contactEmail: "hola@club.co",
        city: "Cali",
        address: "Patinódromo",
        brandColor: "#7c5cff",
      }),
    );

    const policy = { ...DEFAULT_BILLING_POLICY, generationDay: 2, dueDay: 12, enrollmentFee: 80000 };
    await updateBillingPolicy(conn.db, ctx, policy);

    const member = await getMemberSchool(conn.db, slug, owner.id);
    expect(member?.school).toMatchObject({ name: "Club Config Renovado", documentNumber: "800197268-4" });
    expect(readBillingPolicy(member?.school.settings.billing)).toEqual(policy);

    const actions = await runInTenant(conn.db, { schoolId }, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.schoolId, schoolId)),
    );
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(["school.profile_updated", "billing.policy_updated"]),
    );
  });

  it("gestiona tarifas y actualiza el estado de configuración", async () => {
    const { owner, schoolId } = await newSchool();
    const ctx = { schoolId, actorUserId: owner.id };
    const school = async () =>
      (await runInTenant(conn.db, { schoolId }, (tx) => tx.select().from(schools)))[0];

    expect((await getSetupSteps(conn.db, await school())).find((s) => s.key === "billing")?.done).toBe(false);

    const plan = await createFeePlan(conn.db, ctx, {
      name: "Iniciación 3 días",
      description: null,
      monthlyAmount: 120000,
    });
    await updateFeePlan(conn.db, ctx, plan.id, {
      name: "Iniciación 3 días",
      description: "L-M-V",
      monthlyAmount: 130000,
    });
    expect((await listFeePlans(conn.db, schoolId))[0]).toMatchObject({ monthlyAmount: 130000, active: true });
    expect((await getSetupSteps(conn.db, await school())).find((s) => s.key === "billing")?.done).toBe(true);

    await setFeePlanActive(conn.db, ctx, plan.id, false);
    expect((await getSetupSteps(conn.db, await school())).find((s) => s.key === "billing")?.done).toBe(false);
  });

  it("no permite modificar tarifas de otra escuela", async () => {
    const a = await newSchool();
    const b = await newSchool();
    const plan = await createFeePlan(
      conn.db,
      { schoolId: a.schoolId, actorUserId: a.owner.id },
      {
        name: "Plan A",
        description: null,
        monthlyAmount: 100000,
      },
    );
    const hijacked = await updateFeePlan(
      conn.db,
      { schoolId: b.schoolId, actorUserId: b.owner.id },
      plan.id,
      {
        name: "Robado",
        description: null,
        monthlyAmount: 1000,
      },
    );
    expect(hijacked).toBeNull();
    expect((await listFeePlans(conn.db, a.schoolId))[0].name).toBe("Plan A");
    expect(await listFeePlans(conn.db, b.schoolId)).toHaveLength(0);
  });
});
