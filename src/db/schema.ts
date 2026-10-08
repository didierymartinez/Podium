import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
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
export const billingIntervalEnum = pgEnum("billing_interval", ["MONTHLY", "ANNUAL"]);
export const subscriptionMethodEnum = pgEnum("subscription_method", ["CARD", "LINK"]);
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
export const sessionStatusEnum = pgEnum("session_status", ["SCHEDULED", "CANCELED"]);
export const sessionSourceEnum = pgEnum("session_source", ["SCHEDULE", "EXTRA"]);
export const fileKindEnum = pgEnum("file_kind", [
  "SCHOOL_LOGO",
  "ATHLETE_PHOTO",
  "ATHLETE_DOCUMENT",
  "COACH_CERTIFICATE",
  "PAYMENT_PROOF",
]);
export const fileStatusEnum = pgEnum("file_status", ["PENDING", "READY"]);
export const imageConsentEnum = pgEnum("image_consent", ["GRANTED", "DENIED"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["PRESENT", "LATE", "ABSENT", "EXCUSED"]);
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
  /** Preferencias de avisos por canal y tema (ADM-64); ver `src/modules/notifications/preferences.ts`. */
  notificationPrefs: jsonb("notification_prefs").$type<Record<string, unknown>>().notNull().default({}),
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
    /** Revocación de la autorización (Ley 1581): la fila se conserva como prueba. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
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
  /** Suspensión por abuso (super admin, #17): nadie de la escuela puede entrar. */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  logoFileId: uuid("logo_file_id").references((): AnyPgColumn => files.id, { onDelete: "set null" }),
  ...timestamps,
});

/** Configuración flexible; se valida con zod en `src/modules/schools/settings.ts`. */
export type SchoolSettings = {
  billing: Record<string, unknown> & { generationDay: number; dueDay: number };
  attendance?: Record<string, unknown>;
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
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("levels_discipline_idx").on(t.disciplineId)],
);

export const testKindEnum = pgEnum("test_kind", ["TIME", "DISTANCE", "POINTS", "REPS", "SCORE", "POSITION"]);
export const testContextEnum = pgEnum("test_context", ["TRACK", "ROAD", "FIELD"]);

/** Pruebas o métricas para registrar marcas (DEP-02, §2.3): "500 m sprint", "Salto horizontal"… */
export const sportTests = pgTable(
  "sport_tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    /** Modalidad; nulo = prueba física común a todas. */
    disciplineId: uuid("discipline_id").references(() => disciplines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: testKindEnum("kind").notNull(),
    unit: text("unit").notNull(),
    lowerIsBetter: boolean("lower_is_better").notNull(),
    context: testContextEnum("context").notNull(),
    position: integer("position").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("sport_tests_school_idx").on(t.schoolId, t.disciplineId)],
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
  interval: billingIntervalEnum("interval").notNull().default("MONTHLY"),
  /** Tarjeta con cobro automático o link de pago mensual (PSE, Nequi…). */
  method: subscriptionMethodEnum("method"),
  paymentSourceId: text("payment_source_id"),
  cardLabel: text("card_label"),
  billingEmail: text("billing_email"),
  pastDueSince: timestamp("past_due_since", { withTimezone: true }),
  readOnlySince: timestamp("read_only_since", { withTimezone: true }),
  /** Desde cuándo la escuela supera el límite de alumnos de su plan. */
  overLimitSince: timestamp("over_limit_since", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  /** Cupón o descuento otorgado por Podium (consola de super admin). */
  discountPercent: integer("discount_percent").notNull().default(0),
  discountUntil: date("discount_until"),
  ...timestamps,
});

export const platformInvoiceStatusEnum = pgEnum("platform_invoice_status", [
  "PENDING",
  "PAID",
  "FAILED",
  "VOID",
]);

/** Cobros de Podium a la escuela por su suscripción (#21). */
export const platformInvoices = pgTable(
  "platform_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    reference: text("reference").notNull().unique(),
    planCode: text("plan_code").notNull(),
    interval: billingIntervalEnum("interval").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    amount: integer("amount").notNull(),
    status: platformInvoiceStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    providerTransactionId: text("provider_transaction_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("platform_invoices_school_idx").on(t.schoolId, t.status)],
);

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
    photoFileId: uuid("photo_file_id").references((): AnyPgColumn => files.id, { onDelete: "set null" }),
    /** Autorización de uso de imagen (ADM-71), separada de los demás consentimientos. */
    imageConsent: imageConsentEnum("image_consent"),
    imageConsentAt: timestamp("image_consent_at", { withTimezone: true }),
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
    /** Descuento particular sobre la mensualidad (0–100 %), antes del descuento de hermanos. */
    discountPercent: integer("discount_percent").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check("enrollments_discount_ck", sql`${t.discountPercent} between 0 and 100`),
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

// ---------------------------------------------------------------------------
// Calendario, clases y asistencia (docs/GESTION_DEPORTIVA.md §3–4)
// ---------------------------------------------------------------------------

/** Días sin clase definidos por la escuela (vacaciones, cierres). Los festivos son solo referencia. */
export const schoolClosures = pgTable(
  "school_closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("school_closures_school_idx").on(t.schoolId, t.startDate)],
);

/** Clase concreta de un grupo en una fecha (generada desde el horario o extra). */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    status: sessionStatusEnum("status").notNull().default("SCHEDULED"),
    source: sessionSourceEnum("source").notNull().default("SCHEDULE"),
    cancelReason: text("cancel_reason"),
    /** Profesor que reemplaza a los del grupo solo en esta clase (DEP-15). */
    substituteCoachId: uuid("substitute_coach_id").references(() => coaches.id, { onDelete: "set null" }),
    /** Si se reprogramó, la clase nueva (la original queda cancelada). */
    rescheduledToId: uuid("rescheduled_to_id").references((): AnyPgColumn => sessions.id, {
      onDelete: "set null",
    }),
    /** Nota visible para profesores y familias (p. ej. "Clase de reposición", "Llevar casco"). */
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sessions_group_date_time_uq").on(t.groupId, t.date, t.startTime),
    index("sessions_school_date_idx").on(t.schoolId, t.date),
  ],
);

/** Alumnos citados a una clase extra; si una clase extra no tiene filas aquí, va todo el grupo. */
export const sessionAthletes = pgTable(
  "session_athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    /** Clase de reposición (DEP-24): alumno de otro grupo que se suma a esta clase sin reemplazar la lista. */
    makeup: boolean("makeup").notNull().default(false),
  },
  (t) => [uniqueIndex("session_athletes_uq").on(t.sessionId, t.athleteId)],
);

/** Novedades médicas y lesiones (DEP-72): la restricción se muestra en la asistencia hasta el alta. */
export const injuries = pgTable(
  "injuries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    occurredOn: date("occurred_on").notNull(),
    restriction: text("restriction").notNull(),
    /** Fecha de alta; nula mientras siga vigente. */
    clearedOn: date("cleared_on"),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("injuries_athlete_idx").on(t.athleteId)],
);

export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull(),
    excuseReason: text("excuse_reason"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id),
    /** Excusa reportada por el acudiente antes de la clase (DEP-23); el profesor puede corregirla. */
    familyReported: boolean("family_reported").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("attendance_session_athlete_uq").on(t.sessionId, t.athleteId),
    index("attendance_athlete_idx").on(t.athleteId),
  ],
);

/** Archivo en el almacenamiento (R2/S3/disco). Solo se sirve con URL firmada temporal. */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references((): AnyPgColumn => schools.id, { onDelete: "cascade" }),
    kind: fileKindEnum("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    originalName: text("original_name").notNull(),
    status: fileStatusEnum("status").notNull().default("PENDING"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_school_idx").on(t.schoolId, t.kind)],
);

/** Documentos que la escuela pide a cada alumno (ADM-17). */
export const documentTypes = pgTable(
  "document_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    required: boolean("required").notNull().default(true),
    /** Meses de vigencia desde la fecha de expedición; null = no vence. */
    validityMonths: smallint("validity_months"),
    active: boolean("active").notNull().default(true),
    position: smallint("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("document_types_school_name_uq").on(t.schoolId, t.name)],
);

export const athleteDocuments = pgTable(
  "athlete_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    documentTypeId: uuid("document_type_id")
      .notNull()
      .references(() => documentTypes.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    issuedOn: date("issued_on").notNull(),
    expiresOn: date("expires_on"),
    notes: text("notes"),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("athlete_documents_athlete_type_uq").on(t.athleteId, t.documentTypeId)],
);

/** Certificaciones de profesores (primeros auxilios, curso de entrenador…). */
export const coachCertifications = pgTable(
  "coach_certifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => coaches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    issuedOn: date("issued_on"),
    expiresOn: date("expires_on"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("coach_certifications_coach_idx").on(t.coachId)],
);

/**
 * Bandeja de avisos por persona (ADM-13, COM-xx). Es la fuente para la campana en la app,
 * las notificaciones push y los correos; cada canal marca cuándo lo envió.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    pushSentAt: timestamp("push_sent_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    /** Cuándo se procesó la entrega (push o correo) y por cuál canal: "push" | "email" | "none". */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveredVia: text("delivered_via"),
    /** Evita repetir el mismo aviso automático (p. ej. "attendance.risk:<alumno>:2026-10"). */
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq")
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Cobros, pagos y cartera (#9)
// ---------------------------------------------------------------------------

export const invoiceStatusEnum = pgEnum("invoice_status", ["PENDING", "PARTIAL", "PAID", "VOID"]);
export const chargeKindEnum = pgEnum("charge_kind", [
  "MONTHLY",
  "ENROLLMENT",
  "ONE_TIME",
  "PREVIOUS_BALANCE",
  "LATE_FEE",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["CASH", "TRANSFER", "DEPOSIT", "CARD", "ONLINE"]);
export const paymentStatusEnum = pgEnum("payment_status", ["CONFIRMED", "VOID"]);
export const creditNoteKindEnum = pgEnum("credit_note_kind", ["ADJUSTMENT", "EARLY_PAYMENT"]);
export const paymentIntentStatusEnum = pgEnum("payment_intent_status", [
  "PENDING",
  "APPROVED",
  "DECLINED",
  "VOIDED",
  "ERROR",
]);

/** Conceptos de cobro únicos (uniforme, evento…) con valor sugerido (ADM-21). */
export const chargeConcepts = pgTable(
  "charge_concepts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultAmount: integer("default_amount"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("charge_concepts_school_name_uq").on(t.schoolId, t.name)],
);

/** Cuenta de cobro de un responsable de pago (ADM-20). El saldo = total − notas crédito − pagos aplicados. */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    code: text("code").notNull(),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id),
    /** "2026-10" para mensualidades; null para cobros únicos. */
    period: text("period"),
    issuedOn: date("issued_on").notNull(),
    dueOn: date("due_on").notNull(),
    status: invoiceStatusEnum("status").notNull().default("PENDING"),
    total: integer("total").notNull(),
    credited: integer("credited").notNull().default(0),
    paid: integer("paid").notNull().default(0),
    voidReason: text("void_reason"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invoices_school_number_uq").on(t.schoolId, t.number),
    index("invoices_guardian_idx").on(t.guardianId, t.status),
    index("invoices_school_due_idx").on(t.schoolId, t.status, t.dueOn),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: chargeKindEnum("kind").notNull(),
    athleteId: uuid("athlete_id").references(() => athletes.id),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
    period: text("period"),
    description: text("description").notNull(),
    baseAmount: integer("base_amount").notNull(),
    siblingDiscount: integer("sibling_discount").notNull().default(0),
    amount: integer("amount").notNull(),
    /** La cuenta se anuló: la línea ya no cuenta para la idempotencia y se puede volver a generar. */
    voided: boolean("voided").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotencia: una mensualidad por matrícula y periodo (ADM-20); un recargo por cuenta.
    uniqueIndex("invoice_lines_monthly_uq")
      .on(t.enrollmentId, t.period)
      .where(sql`${t.kind} = 'MONTHLY' and not ${t.voided}`),
    uniqueIndex("invoice_lines_late_fee_uq")
      .on(t.invoiceId)
      .where(sql`${t.kind} = 'LATE_FEE'`),
    uniqueIndex("invoice_lines_enrollment_fee_uq")
      .on(t.enrollmentId)
      .where(sql`${t.kind} = 'ENROLLMENT' and not ${t.voided}`),
    index("invoice_lines_invoice_idx").on(t.invoiceId),
    index("invoice_lines_athlete_idx").on(t.athleteId),
  ],
);

/** Ajustes a una cuenta emitida (nunca se edita un cobro): descuentos, correcciones, pronto pago (ADM-24). */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    kind: creditNoteKindEnum("kind").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_notes_invoice_idx").on(t.invoiceId),
    uniqueIndex("credit_notes_early_payment_uq")
      .on(t.invoiceId)
      .where(sql`${t.kind} = 'EARLY_PAYMENT'`),
  ],
);

/** Pago recibido (manual o en línea). Lo no aplicado a cuentas es saldo a favor del acudiente. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    code: text("code").notNull(),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id),
    amount: integer("amount").notNull(),
    paidOn: date("paid_on").notNull(),
    method: paymentMethodEnum("method").notNull(),
    reference: text("reference"),
    proofFileId: uuid("proof_file_id").references(() => files.id, { onDelete: "set null" }),
    notes: text("notes"),
    status: paymentStatusEnum("status").notNull().default("CONFIRMED"),
    /** Id de la transacción en la pasarela (idempotencia de webhooks). */
    providerTransactionId: text("provider_transaction_id"),
    voidReason: text("void_reason"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_school_number_uq").on(t.schoolId, t.number),
    uniqueIndex("payments_provider_tx_uq")
      .on(t.schoolId, t.providerTransactionId)
      .where(sql`${t.providerTransactionId} is not null`),
    index("payments_guardian_idx").on(t.guardianId),
    index("payments_school_date_idx").on(t.schoolId, t.paidOn),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_allocations_payment_idx").on(t.paymentId),
    index("payment_allocations_invoice_idx").on(t.invoiceId),
  ],
);

/** Cuenta de la pasarela de la escuela (Wompi): el dinero llega directo a la escuela. Llaves cifradas. */
export const paymentAccounts = pgTable("payment_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .unique()
    .references(() => schools.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("wompi"),
  environment: text("environment").notNull(), // "sandbox" | "production"
  publicKey: text("public_key").notNull(),
  privateKeyEncrypted: text("private_key_encrypted").notNull(),
  eventsSecretEncrypted: text("events_secret_encrypted").notNull(),
  integritySecretEncrypted: text("integrity_secret_encrypted").notNull(),
  merchantName: text("merchant_name"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ...timestamps,
});

/** Intento de pago en línea de una o varias cuentas (ADM-35). La referencia viaja a la pasarela. */
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id),
    reference: text("reference").notNull().unique(),
    invoiceIds: uuid("invoice_ids").array().notNull(),
    amount: integer("amount").notNull(),
    status: paymentIntentStatusEnum("status").notNull().default("PENDING"),
    providerTransactionId: text("provider_transaction_id"),
    paymentId: uuid("payment_id").references(() => payments.id),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("payment_intents_school_status_idx").on(t.schoolId, t.status)],
);

/** Dispositivos con notificaciones push (token de FCM por navegador o app instalada). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/** Correos automáticos ya enviados (secuencia de bienvenida), para no repetirlos. */
export const emailLog = pgTable("email_log", {
  key: text("key").primaryKey(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Contadores de intentos por ventana de tiempo (registro e ingreso, #20). Sin datos de escuelas. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/** Aviso a la escuela, grupos, niveles, categorías, deudores o personas (COM-10). */
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    audience: jsonb("audience").$type<{ kind: string; ids: string[] }>().notNull(),
    urgent: boolean("urgent").notNull().default(false),
    pinnedUntil: date("pinned_until"),
    /** Fuera del horario permitido se programa para la siguiente franja (7 a. m.). */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    recipientCount: integer("recipient_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_school_idx").on(t.schoolId, t.createdAt)],
);

export const announcementRecipients = pgTable(
  "announcement_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id").references(() => guardians.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    name: text("name").notNull(),
    phone: text("phone"),
    /** Texto ya personalizado para esta persona (variables reemplazadas). */
    message: text("message").notNull(),
    whatsappSentAt: timestamp("whatsapp_sent_at", { withTimezone: true }),
  },
  (t) => [
    index("announcement_recipients_announcement_idx").on(t.announcementId),
    index("announcement_recipients_guardian_idx").on(t.guardianId),
  ],
);

export const paymentReportStatusEnum = pgEnum("payment_report_status", ["PENDING", "APPROVED", "REJECTED"]);

/** Transferencia o consignación reportada por el acudiente, pendiente de verificar (ADM-34). */
export const paymentReports = pgTable(
  "payment_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id),
    amount: integer("amount").notNull(),
    paidOn: date("paid_on").notNull(),
    method: paymentMethodEnum("method").notNull(),
    reference: text("reference"),
    proofFileId: uuid("proof_file_id")
      .notNull()
      .references(() => files.id),
    /** Cuentas que la familia dice pagar (vacío: las más antiguas primero). */
    invoiceIds: jsonb("invoice_ids").$type<string[]>().notNull().default([]),
    status: paymentReportStatusEnum("status").notNull().default("PENDING"),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    paymentId: uuid("payment_id").references(() => payments.id),
    ...timestamps,
  },
  (t) => [index("payment_reports_school_idx").on(t.schoolId, t.status)],
);

export const collectionNoteKindEnum = pgEnum("collection_note_kind", ["CALL", "MESSAGE", "VISIT", "NOTE"]);
export const promiseStatusEnum = pgEnum("promise_status", ["OPEN", "KEPT", "BROKEN"]);

/** Bitácora de gestión de cobro por responsable de pago (ADM-44), con compromiso opcional. */
export const collectionNotes = pgTable(
  "collection_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    kind: collectionNoteKindEnum("kind").notNull(),
    note: text("note").notNull(),
    promiseOn: date("promise_on"),
    promiseAmount: integer("promise_amount"),
    promiseStatus: promiseStatusEnum("promise_status"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("collection_notes_guardian_idx").on(t.guardianId)],
);

export const paymentPlanStatusEnum = pgEnum("payment_plan_status", ["ACTIVE", "COMPLETED", "CANCELED"]);

/** Acuerdo de pago: la deuda dividida en cuotas con fecha (ADM-45). */
export const paymentPlans = pgTable(
  "payment_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    total: integer("total").notNull(),
    startsOn: date("starts_on").notNull(),
    status: paymentPlanStatusEnum("status").notNull().default("ACTIVE"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("payment_plans_guardian_idx").on(t.guardianId, t.status)],
);

export const paymentPlanInstallments = pgTable(
  "payment_plan_installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => paymentPlans.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    dueOn: date("due_on").notNull(),
    amount: integer("amount").notNull(),
  },
  (t) => [uniqueIndex("payment_plan_installments_uq").on(t.planId, t.position)],
);

/** Cierre de caja diario por usuario (ADM-50): esperado por medio vs. efectivo contado. Inmutable. */
export const cashClosings = pgTable(
  "cash_closings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    /** Total recibido por medio de pago ese día. */
    expected: jsonb("expected").$type<Record<string, number>>().notNull(),
    countedCash: integer("counted_cash").notNull(),
    /** Contado − esperado en efectivo (negativo = faltante). */
    difference: integer("difference").notNull(),
    notes: text("notes"),
    paymentIds: jsonb("payment_ids").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("cash_closings_user_day_uq").on(t.schoolId, t.userId, t.date)],
);
