CREATE TYPE "public"."enrollment_status" AS ENUM('PRE_ENROLLED', 'ACTIVE', 'FROZEN', 'WITHDRAWN', 'DISCARDED');--> statement-breakpoint
CREATE TYPE "public"."person_document_type" AS ENUM('RC', 'TI', 'CC', 'CE', 'PPT', 'PASSPORT');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('MOTHER', 'FATHER', 'GUARDIAN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('F', 'M');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_reason" AS ENUM('ECONOMIC', 'SCHEDULE', 'OTHER_SPORT', 'INJURY', 'DISSATISFACTION', 'MOVED', 'OTHER');--> statement-breakpoint
CREATE TABLE "athlete_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship" "relationship" NOT NULL,
	"is_payer" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"document_type" "person_document_type",
	"document_number" text,
	"birth_date" date NOT NULL,
	"sex" "sex",
	"phone" text,
	"email" text,
	"health_insurer" text,
	"blood_type" text,
	"medical_notes_encrypted" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"school_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"fee_plan_id" uuid NOT NULL,
	"status" "enrollment_status" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"frozen_until" date,
	"withdrawal_reason" "withdrawal_reason",
	"status_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"level_id" uuid,
	"capacity" integer NOT NULL,
	"default_fee_plan_id" uuid,
	"color" text DEFAULT '#2f6bff' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"document_type" "person_document_type",
	"document_number" text,
	"phone" text NOT NULL,
	"email" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_schedules" ADD CONSTRAINT "group_schedules_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_schedules" ADD CONSTRAINT "group_schedules_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_default_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("default_fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_guardians_pair_uq" ON "athlete_guardians" USING btree ("athlete_id","guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_guardians_one_payer_uq" ON "athlete_guardians" USING btree ("athlete_id") WHERE "athlete_guardians"."is_payer";--> statement-breakpoint
CREATE INDEX "athlete_guardians_guardian_idx" ON "athlete_guardians" USING btree ("guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_school_document_uq" ON "athletes" USING btree ("school_id","document_type","document_number") WHERE "athletes"."document_number" is not null;--> statement-breakpoint
CREATE INDEX "athletes_school_name_idx" ON "athletes" USING btree ("school_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_current_uq" ON "enrollments" USING btree ("athlete_id","group_id") WHERE "enrollments"."status" in ('PRE_ENROLLED', 'ACTIVE', 'FROZEN');--> statement-breakpoint
CREATE INDEX "enrollments_group_idx" ON "enrollments" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "group_schedules_group_idx" ON "group_schedules" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_school_phone_uq" ON "guardians" USING btree ("school_id","phone");