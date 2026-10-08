import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, enrollments, groupSchedules, groups, levels, schools } from "@/db/schema";
import { addDays, weekdayIndex, type IsoDate } from "@/lib/dates";
import { normalizeColombianMobile } from "@/lib/phone";
import { AthleteDomainError, createAthleteTx } from "@/modules/athletes/athletes";
import { athleteSchema, guardianSchema } from "@/modules/athletes/schemas";
import { managerUserIds, notifyUsers } from "@/modules/notifications/notify";

/** Pre-inscripción pública con clase de prueba (ADM-19). */

const CURRENT = ["ACTIVE", "PRE_ENROLLED", "FROZEN"] as const;
/** Días hacia adelante para elegir la clase de prueba. */
export const TRIAL_WINDOW_DAYS = 21;

export function readSignupSettings(raw: unknown): { enabled: boolean; intro: string } {
  const s = (raw ?? {}) as { enabled?: unknown; intro?: unknown };
  return { enabled: s.enabled === true, intro: typeof s.intro === "string" ? s.intro.slice(0, 500) : "" };
}

export function updateSignupSettings(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  input: { enabled: boolean; intro: string },
) {
  const value = { enabled: input.enabled, intro: input.intro.trim().slice(0, 500) };
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx
      .update(schools)
      .set({ settings: sql`jsonb_set(${schools.settings}, '{signup}', ${JSON.stringify(value)}::jsonb)` })
      .where(eq(schools.id, ctx.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "signup.settings_updated",
      entity: "school",
      entityId: ctx.schoolId,
      data: value,
    });
  });
}

/** Próximas fechas de clase según el horario del grupo. */
export function trialDates(schedule: { weekday: number }[], today: IsoDate, days = TRIAL_WINDOW_DAYS) {
  const out: IsoDate[] = [];
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    if (schedule.some((s) => s.weekday === weekdayIndex(date))) out.push(date);
  }
  return out;
}

export type PublicGroup = {
  id: string;
  name: string;
  levelName: string | null;
  schedule: { weekday: number; startTime: string; endTime: string }[];
  spots: number;
  dates: IsoDate[];
};

/** Lo que ve el público: solo si la escuela activó el formulario; grupos activos con tarifa y cupo. */
export function publicSignupInfo(database: Database, schoolId: string, today: IsoDate) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [school] = await tx
      .select({
        name: schools.name,
        city: schools.city,
        brandColor: schools.brandColor,
        settings: schools.settings,
      })
      .from(schools)
      .where(eq(schools.id, schoolId));
    if (!school) return null;
    const settings = readSignupSettings(school.settings.signup);
    if (!settings.enabled) return null;
    const rows = await tx
      .select({ group: groups, levelName: levels.name })
      .from(groups)
      .leftJoin(levels, eq(levels.id, groups.levelId))
      .where(and(eq(groups.active, true), sql`${groups.defaultFeePlanId} is not null`))
      .orderBy(asc(levels.position), asc(groups.name));
    const ids = rows.map((r) => r.group.id);
    const [slots, counts] = ids.length
      ? await Promise.all([
          tx
            .select()
            .from(groupSchedules)
            .where(inArray(groupSchedules.groupId, ids))
            .orderBy(asc(groupSchedules.weekday), asc(groupSchedules.startTime)),
          tx
            .select({ groupId: enrollments.groupId, value: count() })
            .from(enrollments)
            .where(and(inArray(enrollments.groupId, ids), inArray(enrollments.status, [...CURRENT])))
            .groupBy(enrollments.groupId),
        ])
      : [[], []];
    const list: PublicGroup[] = rows
      .map(({ group, levelName }) => {
        const schedule = slots
          .filter((s) => s.groupId === group.id)
          .map((s) => ({
            weekday: s.weekday,
            startTime: s.startTime.slice(0, 5),
            endTime: s.endTime.slice(0, 5),
          }));
        return {
          id: group.id,
          name: group.name,
          levelName,
          schedule,
          spots: group.capacity - (counts.find((c) => c.groupId === group.id)?.value ?? 0),
          dates: trialDates(schedule, today),
        };
      })
      .filter((g) => g.spots > 0 && g.dates.length > 0);
    return {
      name: school.name,
      city: school.city,
      brandColor: school.brandColor,
      intro: settings.intro,
      groups: list,
    };
  });
}

const name = (label: string) => z.string().trim().min(2, `Escribe ${label}`).max(60);

export const signupSchema = z.object({
  athleteFirstName: name("el nombre del alumno"),
  athleteLastName: name("el apellido del alumno"),
  birthDate: z.iso.date("Escribe la fecha de nacimiento"),
  guardianFirstName: name("tu nombre"),
  guardianLastName: name("tu apellido"),
  phone: z
    .string()
    .transform((v) => normalizeColombianMobile(v))
    .refine((v): v is string => v !== null, "Escribe un celular colombiano válido"),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Escribe un correo válido")
    .transform((v) => v || ""),
  groupId: z.uuid("Elige un grupo"),
  trialDate: z.iso.date("Elige el día de la clase de prueba"),
  dataConsent: z.literal(true, "Debes autorizar el tratamiento de datos"),
});

export type SignupResult =
  | { ok: true; athleteId: string; trialDate: IsoDate; groupName: string }
  | { ok: false; error: "closed" | "group_unavailable" | "date_unavailable" | "duplicate" | "invalid" };

/**
 * Crea al alumno PREINSCRITO en el grupo desde la fecha de la clase de prueba (aparece en la asistencia
 * marcado "prueba"), con su acudiente responsable (o el existente por celular), y avisa a la administración.
 */
export async function submitSignup(
  database: Database,
  school: { id: string; slug: string },
  raw: z.input<typeof signupSchema>,
  meta: { today: IsoDate; ip: string | null },
): Promise<SignupResult> {
  const input = signupSchema.parse(raw);
  const info = await publicSignupInfo(database, school.id, meta.today);
  if (!info) return { ok: false, error: "closed" };
  const group = info.groups.find((g) => g.id === input.groupId);
  if (!group) return { ok: false, error: "group_unavailable" };
  if (!group.dates.includes(input.trialDate)) return { ok: false, error: "date_unavailable" };
  try {
    return await runInTenant(database, { schoolId: school.id }, async (tx) => {
      const [row] = await tx
        .select({ feePlanId: groups.defaultFeePlanId })
        .from(groups)
        .where(eq(groups.id, group.id));
      const ctx = { schoolId: school.id, actorUserId: null as unknown as string };
      const created = await createAthleteTx(tx, ctx, {
        athlete: athleteSchema.parse({
          firstName: input.athleteFirstName,
          lastName: input.athleteLastName,
          documentType: null,
          documentNumber: "",
          birthDate: input.birthDate,
          sex: null,
          phone: "",
          email: "",
          healthInsurer: "",
          bloodType: null,
          medicalNotes: "",
          emergencyContactName: "",
          emergencyContactPhone: "",
          schoolName: "",
          notes: `Pre-inscripción pública: clase de prueba el ${input.trialDate}.`,
        }),
        guardian: {
          ...guardianSchema.parse({
            firstName: input.guardianFirstName,
            lastName: input.guardianLastName,
            documentType: null,
            documentNumber: "",
            phone: input.phone,
            email: input.email,
          }),
          relationship: "GUARDIAN",
        },
        enrollment: {
          groupId: group.id,
          feePlanId: row.feePlanId!,
          startDate: input.trialDate,
          status: "PRE_ENROLLED",
        },
        today: meta.today,
      });
      await tx.insert(auditLogs).values({
        schoolId: school.id,
        actorUserId: null,
        action: "signup.submitted",
        entity: "athlete",
        entityId: created.athleteId,
        data: { groupId: group.id, trialDate: input.trialDate, ip: meta.ip, dataConsent: true },
      });
      await notifyUsers(tx, school.id, await managerUserIds(tx), {
        kind: "signup.submitted",
        title: `Nueva pre-inscripción: ${input.athleteFirstName} ${input.athleteLastName}`,
        body: `Clase de prueba en ${group.name} el ${input.trialDate}.`,
        href: `/${school.slug}/alumnos/${created.athleteId}`,
      });
      return {
        ok: true as const,
        athleteId: created.athleteId,
        trialDate: input.trialDate,
        groupName: group.name,
      };
    });
  } catch (err) {
    if (err instanceof AthleteDomainError) {
      if (err.code === "document_taken") return { ok: false, error: "duplicate" };
      if (err.code === "group_full") return { ok: false, error: "group_unavailable" };
      return { ok: false, error: "invalid" };
    }
    throw err;
  }
}
