import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const schoolTypeEnum = pgEnum("school_type", ["SPORTS_SCHOOL", "GYM"]);
export const schoolStatusEnum = pgEnum("school_status", [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "READ_ONLY",
  "CANCELED",
]);
export const schoolRoleEnum = pgEnum("school_role", [
  "OWNER",
  "ADMIN",
  "COORDINATOR",
  "COACH",
  "GUARDIAN",
  "ATHLETE",
]);
export const membershipStatusEnum = pgEnum("membership_status", ["ACTIVE", "INACTIVE"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
]);
export const sportEnum = pgEnum("sport", ["SKATING"]);
export const documentTypeEnum = pgEnum("document_type", ["NIT", "CC", "CE"]);
export const personDocumentTypeEnum = pgEnum("person_document_type", [
  "RC",
  "TI",
  "CC",
  "CE",
  "PPT",
  "PASSPORT",
]);
export const sexEnum = pgEnum("sex", ["F", "M"]);
export const relationshipEnum = pgEnum("relationship", ["MOTHER", "FATHER", "GUARDIAN", "OTHER"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "PRE_ENROLLED",
  "ACTIVE",
  "FROZEN",
  "WITHDRAWN",
  "DISCARDED",
]);
export const invitationRoleEnum = pgEnum("invitation_role", ["GUARDIAN", "ATHLETE", "COACH"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["PENDING", "ACCEPTED", "CANCELED"]);
export const coachRoleEnum = pgEnum("coach_role", ["HEAD", "ASSISTANT"]);
export const withdrawalReasonEnum = pgEnum("withdrawal_reason", [
  "ECONOMIC",
  "SCHEDULE",
  "OTHER_SPORT",
  "INJURY",
  "DISSATISFACTION",
  "MOVED",
  "OTHER",
]);

// ---------------------------------------------------------------------------
// Plataforma (sin RLS: la aplicación controla el acceso)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Referencia externa al proveedor de identidad (regla de portabilidad #7).
  firebaseUid: text("firebase_uid").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  ...timestamps,
});

export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Escuela a la que se otorga la autorización (nulo = términos de la plataforma). */
    schoolId: uuid("school_id"),
    document: text("document").notNull(), // TERMS | PRIVACY | SCHOOL_DATA | WHATSAPP
    version: text("version").notNull(),
    ip: text("ip"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("legal_acceptances_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Escuelas (tenant) — todas con RLS por school_id
// ---------------------------------------------------------------------------

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  type: schoolTypeEnum("type").notNull().default("SPORTS_SCHOOL"),
  status: schoolStatusEnum("status").notNull().default("TRIAL"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  estimatedStudents: text("estimated_students"),
  // Perfil (ADM-01)
  legalName: text("legal_name"),
  documentType: documentTypeEnum("document_type"),
  documentNumber: text("document_number"),
  phone: text("phone"),
  contactEmail: text("contact_email"),
  address: text("address"),
  brandColor: text("brand_color").notNull().default("#2f6bff"),
  timezone: text("timezone").notNull().default("America/Bogota"),
  currency: text("currency").notNull().default("COP"),
  settings: jsonb("settings").$type<SchoolSettings>().notNull(),
  commsEnabledAt: timestamp("comms_enabled_at", { withTimezone: true }),
  ...timestamps,
});

/** Configuración flexible; se valida con zod en `src/modules/schools/settings.ts`. */
export type SchoolSettings = {
  billing: Record<string, unknown> & { generationDay: number; dueDay: number };
};

export const schoolMemberships = pgTable(
  "school_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roles: schoolRoleEnum("roles").array().notNull(),
    status: membershipStatusEnum("status").notNull().default("ACTIVE"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("school_memberships_school_user_uq").on(t.schoolId, t.userId),
    index("school_memberships_user_idx").on(t.userId),
  ],
);

export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  ...timestamps,
});

export const disciplines = pgTable(
  "disciplines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    sport: sportEnum("sport").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("disciplines_school_code_uq").on(t.schoolId, t.code)],
);

export const levels = pgTable(
  "levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    disciplineId: uuid("discipline_id")
      .notNull()
      .references(() => disciplines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    goal: text("goal"),
    ...timestamps,
  },
  (t) => [index("levels_discipline_idx").on(t.disciplineId)],
);

export const ageCategories = pgTable("age_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  minAge: integer("min_age"),
  maxAge: integer("max_age"),
  position: integer("position").notNull(),
  ...timestamps,
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .unique()
    .references(() => schools.id, { onDelete: "cascade" }),
  planCode: text("plan_code").notNull(),
  status: subscriptionStatusEnum("status").notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  ...timestamps,
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id").references(() => schools.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_school_idx").on(t.schoolId, t.createdAt)],
);

/** Tarifas mensuales de la escuela (valores en pesos colombianos, enteros). */
export const feePlans = pgTable(
  "fee_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    monthlyAmount: integer("monthly_amount").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("fee_plans_school_idx").on(t.schoolId)],
);

// ---------------------------------------------------------------------------
// Personas, grupos y matrículas (docs/GESTION_ADMINISTRATIVA.md §3–4)
// ---------------------------------------------------------------------------

export const athletes = pgTable(
  "athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    documentType: personDocumentTypeEnum("document_type"),
    documentNumber: text("document_number"),
    birthDate: date("birth_date").notNull(),
    sex: sexEnum("sex"),
    phone: text("phone"),
    email: text("email"),
    healthInsurer: text("health_insurer"), // EPS
    bloodType: text("blood_type"),
    /** Alergias, condiciones y medicamentos: cifrado en la aplicación (ADM-73). */
    medicalNotesEncrypted: text("medical_notes_encrypted"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    schoolName: text("school_name"), // colegio
    notes: text("notes"),
    /** Se llena cuando el alumno (≥ 14 años o adulto) acepta su invitación. */
    userId: uuid("user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("athletes_school_document_uq")
      .on(t.schoolId, t.documentType, t.documentNumber)
      .where(sql`${t.documentNumber} is not null`),
    index("athletes_school_name_idx").on(t.schoolId, t.lastName, t.firstName),
  ],
);

export const guardians = pgTable(
  "guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    documentType: personDocumentTypeEnum("document_type"),
    documentNumber: text("document_number"),
    phone: text("phone").notNull(),
    email: text("email"),
    /** Se llena cuando el acudiente acepta su invitación. */
    userId: uuid("user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("guardians_school_phone_uq").on(t.schoolId, t.phone)],
);

export const athleteGuardians = pgTable(
  "athlete_guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    relationship: relationshipEnum("relationship").notNull(),
    isPayer: boolean("is_payer").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("athlete_guardians_pair_uq").on(t.athleteId, t.guardianId),
    // Exactamente un responsable de pago por alumno.
    uniqueIndex("athlete_guardians_one_payer_uq")
      .on(t.athleteId)
      .where(sql`${t.isPayer}`),
    index("athlete_guardians_guardian_idx").on(t.guardianId),
  ],
);

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  disciplineId: uuid("discipline_id")
    .notNull()
    .references(() => disciplines.id),
  levelId: uuid("level_id").references(() => levels.id),
  capacity: integer("capacity").notNull(),
  defaultFeePlanId: uuid("default_fee_plan_id").references(() => feePlans.id),
  color: text("color").notNull().default("#2f6bff"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** Horario recurrente: weekday 0 = lunes … 6 = domingo. */
export const groupSchedules = pgTable(
  "group_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [index("group_schedules_group_idx").on(t.groupId)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    feePlanId: uuid("fee_plan_id")
      .notNull()
      .references(() => feePlans.id),
    status: enrollmentStatusEnum("status").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    frozenUntil: date("frozen_until"),
    withdrawalReason: withdrawalReasonEnum("withdrawal_reason"),
    statusNotes: text("status_notes"),
    ...timestamps,
  },
  (t) => [
    // Un alumno no puede tener dos matrículas vigentes en el mismo grupo.
    uniqueIndex("enrollments_current_uq")
      .on(t.athleteId, t.groupId)
      .where(sql`${t.status} in ('PRE_ENROLLED', 'ACTIVE', 'FROZEN')`),
    index("enrollments_group_idx").on(t.groupId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Profesores e invitaciones
// ---------------------------------------------------------------------------

export const coaches = pgTable(
  "coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    documentType: personDocumentTypeEnum("document_type"),
    documentNumber: text("document_number"),
    phone: text("phone").notNull(),
    email: text("email"),
    specialty: text("specialty"),
    hiredOn: date("hired_on"),
    active: boolean("active").notNull().default(true),
    userId: uuid("user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("coaches_school_phone_uq").on(t.schoolId, t.phone)],
);

export const groupCoaches = pgTable(
  "group_coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => coaches.id, { onDelete: "cascade" }),
    role: coachRoleEnum("role").notNull(),
  },
  (t) => [
    uniqueIndex("group_coaches_pair_uq").on(t.groupId, t.coachId),
    uniqueIndex("group_coaches_one_head_uq")
      .on(t.groupId)
      .where(sql`${t.role} = 'HEAD'`),
    index("group_coaches_coach_idx").on(t.coachId),
  ],
);

/** Invitación para entrar a la escuela; el token solo existe en el link (se guarda su hash). */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    role: invitationRoleEnum("role").notNull(),
    guardianId: uuid("guardian_id").references(() => guardians.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id").references(() => coaches.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    status: invitationStatusEnum("status").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invitations_school_status_idx").on(t.schoolId, t.status),
    index("invitations_guardian_idx").on(t.guardianId),
    index("invitations_coach_idx").on(t.coachId),
  ],
);
