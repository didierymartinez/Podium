import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
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
    document: text("document").notNull(), // TERMS | PRIVACY
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
  timezone: text("timezone").notNull().default("America/Bogota"),
  currency: text("currency").notNull().default("COP"),
  settings: jsonb("settings").$type<SchoolSettings>().notNull(),
  commsEnabledAt: timestamp("comms_enabled_at", { withTimezone: true }),
  ...timestamps,
});

export type SchoolSettings = {
  billing: {
    generationDay: number;
    dueDay: number;
  };
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
