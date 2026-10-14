/**
 * Escuela de demostración con datos 100 % ficticios para capturas y ventas (#76).
 *
 * Uso (base migrada aparte, p. ej. podium_demo):
 *   DEMO_DATABASE_URL=postgres://podium_app:...@localhost:5432/podium_demo \
 *   DEMO_OWNER_DATABASE_URL=postgres://postgres:...@localhost:5432/podium_demo \
 *   DATA_ENCRYPTION_KEY=... pnpm tsx scripts/demo/seed.mts
 *
 * Ingreso en modo dev: directora@example.com (administración), familia@example.com (familia),
 * profesor@example.com (profesor).
 */
import { and, eq, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runInTenant } from "@/db/rls";
import * as schema from "@/db/schema";
import {
  coaches,
  disciplines,
  guardians,
  legalAcceptances,
  levels,
  sessions,
  sportTests,
  users,
} from "@/db/schema";
import { addDays, todayIn, type IsoDate } from "@/lib/dates";
import { createAnnouncement } from "@/modules/announcements/announcements";
import { createAthlete } from "@/modules/athletes/athletes";
import { athleteSchema, guardianSchema } from "@/modules/athletes/schemas";
import { loadRoster, saveAttendance } from "@/modules/attendance/attendance";
import { syncSessions } from "@/modules/attendance/sessions";
import { createFeePlan } from "@/modules/billing/fee-plans";
import { generateMonth } from "@/modules/billing/invoices";
import { recordPayment } from "@/modules/billing/payments";
import { DEFAULT_BILLING_POLICY, type BillingPolicy } from "@/modules/billing/policy";
import { coachSchema, createCoach } from "@/modules/coaches/coaches";
import { createGroup } from "@/modules/groups/groups";
import { createSchool } from "@/modules/schools/create-school";
import { recordPerformances } from "@/modules/sports/performances";
import { LEGAL_VERSION } from "@/modules/auth/users";

const url = process.env.DEMO_DATABASE_URL;
const ownerUrl = process.env.DEMO_OWNER_DATABASE_URL;
if (!url || !ownerUrl) throw new Error("Faltan DEMO_DATABASE_URL y DEMO_OWNER_DATABASE_URL");
const client = postgres(url, { prepare: false, max: 4, onnotice: () => {} });
const db = drizzle(client, { schema });
const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} });

const TZ = "America/Bogota";
const today = todayIn(TZ);
const policy: BillingPolicy = { ...DEFAULT_BILLING_POLICY, dueDay: 10 };
const noStore = {} as Parameters<typeof recordPayment>[1];

// Generador pseudoaleatorio con semilla: el demo sale igual cada vez.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

async function user(email: string, name: string) {
  const [row] = await db.insert(users).values({ email, name, emailVerifiedAt: new Date() }).returning();
  await db.insert(legalAcceptances).values([
    { userId: row.id, document: "TERMS", version: LEGAL_VERSION },
    { userId: row.id, document: "PRIVACY", version: LEGAL_VERSION },
  ]);
  return row;
}

const director = await user("directora@example.com", "Carolina Mejía");
const created = await createSchool(
  db,
  director.id,
  { name: "Club Patín Veloz", slug: "patin-veloz", city: "Medellín", discipline: "speed", estimatedStudents: "31-80" },
  new Date(`${addDays(today, -200)}T12:00:00Z`),
);
if (!created.ok) throw new Error("La escuela ya existe: usa una base limpia");
const schoolId = created.schoolId;
const ctx = { schoolId, actorUserId: director.id, slug: created.slug };

// Perfil completo (se ve como una escuela ya configurada).
await owner`update schools set document_number = '901234567', phone = '+573001112233', comms_enabled_at = now(),
  status = 'ACTIVE' where id = ${schoolId}`;
await owner`update subscriptions set status = 'ACTIVE', plan_code = 'club', method = 'CARD', card_label = 'Visa •••• 4242',
  current_period_end = now() + interval '20 days' where school_id = ${schoolId}`;

const [discipline] = await runInTenant(db, { schoolId }, (tx) => tx.select().from(disciplines));
const levelRows = await runInTenant(db, { schoolId }, (tx) =>
  tx.select().from(levels).where(eq(levels.disciplineId, discipline.id)).orderBy(levels.position),
);

const plans = {
  three: await createFeePlan(db, ctx, { name: "Mensualidad 3 días", description: null, monthlyAmount: 160_000 }),
  five: await createFeePlan(db, ctx, { name: "Mensualidad 5 días", description: null, monthlyAmount: 220_000 }),
  adults: await createFeePlan(db, ctx, { name: "Adultos", description: null, monthlyAmount: 140_000 }),
};

const coachData = [
  ["Andrés", "Restrepo", "3105550101", "Entrenador de velocidad", "profesor@example.com"],
  ["Valentina", "Ospina", "3105550102", "Formación infantil", null],
  ["Mateo", "Cárdenas", "3105550103", "Preparación física", null],
] as const;
const coachIds: string[] = [];
for (const [firstName, lastName, phone, specialty, email] of coachData) {
  const c = await createCoach(
    db,
    ctx,
    coachSchema.parse({
      firstName,
      lastName,
      documentType: null,
      documentNumber: "",
      phone,
      email: "",
      specialty,
      hiredOn: addDays(today, -400),
    }),
  );
  if (!c.ok) throw new Error("coach");
  coachIds.push(c.coachId);
  if (email) {
    const u = await user(email, `${firstName} ${lastName}`);
    await owner`insert into school_memberships (school_id, user_id, roles) values (${schoolId}, ${u.id}, '{COACH}')`;
    await runInTenant(db, { schoolId }, (tx) =>
      tx.update(coaches).set({ userId: u.id }).where(eq(coaches.id, c.coachId)),
    );
  }
}

const slot = (days: number[], start: string, end: string) =>
  days.map((weekday) => ({ weekday, startTime: start, endTime: end }));
const groupDefs = [
  { name: "Iniciación", level: 0, cap: 18, plan: plans.three.id, color: "#22c55e", coach: 1, schedule: slot([0, 2, 4], "15:00", "16:30"), kids: [5, 7] },
  { name: "Formación", level: 1, cap: 18, plan: plans.three.id, color: "#2f6bff", coach: 1, schedule: slot([0, 2, 4], "16:30", "18:00"), kids: [7, 10] },
  { name: "Intermedio", level: 2, cap: 16, plan: plans.three.id, color: "#f59e0b", coach: 0, schedule: slot([1, 3, 5], "14:30", "16:30"), kids: [9, 13] },
  { name: "Competencia", level: 4, cap: 14, plan: plans.five.id, color: "#ef4444", coach: 0, schedule: slot([0, 1, 2, 3, 4], "17:00", "19:30"), kids: [12, 17] },
  { name: "Adultos", level: 0, cap: 15, plan: plans.adults.id, color: "#8b5cf6", coach: 2, schedule: slot([1, 3], "19:30", "21:00"), kids: [25, 45] },
];
const groupIds: string[] = [];
for (const g of groupDefs) {
  const created = await createGroup(db, ctx, {
    name: g.name,
    disciplineId: discipline.id,
    levelId: levelRows[g.level]?.id ?? null,
    capacity: g.cap,
    defaultFeePlanId: g.plan,
    color: g.color,
    schedule: g.schedule,
    headCoachId: coachIds[g.coach],
    assistantCoachIds: g.name === "Competencia" ? [coachIds[2]] : [],
  });
  groupIds.push(created.id);
}

// Los horarios solo generan clases desde la creación del grupo.
await owner`update groups set created_at = now() - interval '200 days' where school_id = ${schoolId}`;

const FIRST_F = ["Sofía", "Valeria", "Isabella", "Mariana", "Salomé", "Luciana", "Antonella", "Sara", "Emilia", "Juliana", "Gabriela", "Manuela", "Daniela", "Camila", "Paula"];
const FIRST_M = ["Santiago", "Samuel", "Matías", "Emiliano", "Tomás", "Jerónimo", "Martín", "Simón", "Juan José", "Sebastián", "Nicolás", "Miguel Ángel", "David", "Felipe", "Esteban"];
const LAST = ["García", "Rodríguez", "López", "Martínez", "Gómez", "Ramírez", "Herrera", "Zapata", "Vélez", "Arango", "Montoya", "Castaño", "Echeverri", "Londoño", "Agudelo", "Muñoz", "Salazar", "Uribe", "Betancur", "Toro"];
const PARENT_F = ["Laura", "Natalia", "Catalina", "Diana", "Paola", "Andrea", "Marcela", "Lina", "Adriana", "Claudia"];
const PARENT_M = ["Jorge", "Carlos", "Alejandro", "Juan Carlos", "Mauricio", "Ricardo", "Fernando", "Óscar"];
const counts = [14, 16, 14, 12, 9];

type Kid = { id: string; group: number; guardianPhone: string; reliability: number };
const kids: Kid[] = [];
let phoneSeq = 1000;
for (const [gi, g] of groupDefs.entries()) {
  for (let i = 0; i < counts[gi]; i++) {
    const female = rand() < 0.5;
    const lastName = `${pick(LAST)} ${pick(LAST)}`;
    const age = g.kids[0] + Math.floor(rand() * (g.kids[1] - g.kids[0] + 1));
    const birth = `${Number(today.slice(0, 4)) - age}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`;
    const adult = gi === 4;
    const guardianPhone = `300555${phoneSeq++}`;
    // Casi todos llevan meses; unos pocos entraron hace poco.
    const r = rand();
    const startDate =
      r < 0.8 ? addDays(today, -190) : r < 0.93 ? addDays(today, -Math.floor(20 + rand() * 60)) : `${today.slice(0, 7)}-01`;
    const motherName = pick(PARENT_F);
    const result = await createAthlete(db, ctx, {
      athlete: athleteSchema.parse({
        firstName: female ? pick(FIRST_F) : pick(FIRST_M),
        lastName,
        documentType: null,
        documentNumber: "",
        birthDate: birth,
        sex: female ? "F" : "M",
        phone: adult ? guardianPhone : "",
        email: "",
        healthInsurer: pick(["SURA", "Sanitas", "Nueva EPS", "Coomeva"]),
        bloodType: null,
        medicalNotes: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        schoolName: "",
        notes: "",
      }),
      guardian: {
        ...guardianSchema.parse({
          firstName: adult ? (female ? pick(FIRST_F) : pick(FIRST_M)) : rand() < 0.75 ? motherName : pick(PARENT_M),
          lastName: adult ? lastName : lastName.split(" ")[0] + " " + pick(LAST),
          documentType: null,
          documentNumber: "",
          phone: guardianPhone,
          email: "",
        }),
        relationship: adult ? "OTHER" : "MOTHER",
      },
      enrollment: { groupId: groupIds[gi], feePlanId: g.plan, startDate, status: "ACTIVE" },
      today: startDate,
    });
    if (!result.ok) throw new Error(`athlete: ${result.error}`);
    kids.push({ id: result.athleteId, group: gi, guardianPhone, reliability: 0.72 + rand() * 0.27 });
  }
}

// Familia con acceso al portal (primer alumno de Formación).
const familyKid = kids.find((k) => k.group === 1)!;
const [familyGuardian] = await owner<{ first_name: string; last_name: string }[]>`
  select first_name, last_name from guardians where phone = ${`+57${familyKid.guardianPhone}`}`;
const [{ id: familyGuardianId }] = await owner<{ id: string }[]>`
  select id from guardians where phone = ${`+57${familyKid.guardianPhone}`}`;
const family = await user("familia@example.com", `${familyGuardian.first_name} ${familyGuardian.last_name}`);
await owner`insert into school_memberships (school_id, user_id, roles) values (${schoolId}, ${family.id}, '{GUARDIAN}')`;
await runInTenant(db, { schoolId }, (tx) =>
  tx.update(guardians).set({ userId: family.id }).where(eq(guardians.phone, `+57${familyKid.guardianPhone}`)),
);

// Clases de los últimos meses (la ventana de planeación va 14 días atrás).
const school = { id: schoolId, timezone: TZ };
for (let d = -180; d <= 0; d += 10) await syncSessions(db, school, addDays(today, d));
const past = await runInTenant(db, { schoolId }, (tx) =>
  tx
    .select()
    .from(sessions)
    .where(and(lte(sessions.date, addDays(today, -1)), inArray(sessions.groupId, groupIds))),
);
const managerCtx = { schoolId, actorUserId: director.id, timeZone: TZ, isManager: true };
let saved = 0;
const errors = new Map<string, number>();
for (const s of past) {
  const roster = new Set(
    (await runInTenant(db, { schoolId }, (tx) => loadRoster(tx, s))).map((r) => r.athleteId),
  );
  if (roster.size === 0) continue;
  const entries = kids
    .filter((k) => roster.has(k.id))
    .map((k) => {
      const r = rand();
      const status =
        r < k.reliability ? "PRESENT" : r < k.reliability + 0.06 ? "LATE" : r < k.reliability + 0.12 ? "EXCUSED" : "ABSENT";
      return { athleteId: k.id, status, excuseReason: status === "EXCUSED" ? "Cita médica" : null };
    });
  const res = await saveAttendance(db, managerCtx, s.id, { entries } as never);
  if (res.ok) saved++;
  else errors.set(res.error, (errors.get(res.error) ?? 0) + 1);
}
console.log(`Asistencia en ${saved} de ${past.length} clases`, errors);

// Cobros de 6 meses: casi todo pagado; el mes actual a medias y algunos vencidos.
const month = (n: number) => {
  const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
for (let m = -5; m <= 0; m++) {
  const period = month(m);
  await generateMonth(db, ctx, period, `${period}-01` as IsoDate, policy);
}
const invoiceRows = await owner<
  { id: string; guardian_id: string; total: number; period: string }[]
>`select id, guardian_id, total, period from invoices where school_id = ${schoolId} order by period`;
const methods = ["TRANSFER", "TRANSFER", "CASH", "CARD"] as const;
for (const inv of invoiceRows) {
  const current = inv.period === month(0);
  // La familia del portal tiene pendiente la cuenta del mes (para mostrar el botón Pagar).
  if (current && inv.guardian_id === familyGuardianId) continue;
  const r = rand();
  if (current ? r > 0.82 : r > 0.97) continue;
  const day = Math.min(Number(today.slice(8, 10)), 1 + Math.floor(rand() * 12));
  const paidOn = (current ? `${inv.period}-${String(Math.max(1, day)).padStart(2, "0")}` : `${inv.period}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}`) as IsoDate;
  await recordPayment(
    db,
    noStore,
    ctx,
    { guardianId: inv.guardian_id, amount: inv.total, paidOn, method: pick(methods), reference: null, notes: null, proofFileId: null, invoiceIds: [inv.id] },
    today,
    policy,
  );
}

// Marcas del grupo de competencia: mejoran mes a mes.
const tests = await runInTenant(db, { schoolId }, (tx) => tx.select().from(sportTests));
const byName = (name: string) => tests.find((t) => t.name === name)!;
const comp = kids.filter((k) => k.group === 3);
for (const [name, base] of [["200 m contrarreloj", 24.5], ["500 m sprint", 52], ["30 m lanzados", 4.4]] as const) {
  const skill = new Map(comp.map((k) => [k.id, 0.92 + rand() * 0.16]));
  for (let m = 5; m >= 0; m--) {
    await recordPerformances(
      db,
      ctx,
      {
        testId: byName(name).id,
        recordedOn: addDays(today, -m * 28 - 3),
        context: m === 1 ? "COMPETITION" : "CONTROL",
        timing: "ELECTRONIC",
        entries: comp.map((k) => ({
          athleteId: k.id,
          value: Math.round(base * skill.get(k.id)! * (1 + m * 0.012 + (rand() - 0.5) * 0.01) * 100) / 100,
        })),
      },
      { isManager: true },
    );
  }
}

// Avisos.
const author = { schoolId, actorUserId: director.id, slug: created.slug, schoolName: "Club Patín Veloz", timeZone: TZ, isManager: true };
await createAnnouncement(db, author, {
  title: "Festival interclubes del sábado",
  body: "Este sábado nos vemos a las 7:30 a. m. en la pista del estadio. Lleven uniforme completo, casco e hidratación. ¡Los esperamos!",
  audience: { kind: "school", ids: [] },
  pinnedUntil: addDays(today, 6),
});
await createAnnouncement(db, author, {
  title: "Cambio de horario del grupo Competencia",
  body: "Desde el lunes el grupo Competencia entrena de 5:00 a 7:30 p. m. por mantenimiento de la pista.",
  audience: { kind: "groups", ids: [groupIds[3]] },
});

await client.end();
await owner.end();
console.log(`Listo: /${created.slug} con ${kids.length} alumnos`);
