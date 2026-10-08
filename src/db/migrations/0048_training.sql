CREATE TYPE "public"."exercise_component" AS ENUM('WARMUP', 'TECHNIQUE', 'PHYSICAL', 'SPEED', 'ENDURANCE', 'TACTICS', 'GAME', 'COOLDOWN');--> statement-breakpoint
CREATE TYPE "public"."plan_fulfillment" AS ENUM('YES', 'PARTIAL', 'NO');--> statement-breakpoint
CREATE TYPE "public"."plan_phase" AS ENUM('WARMUP', 'MAIN', 'COOLDOWN');--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"discipline_id" uuid,
	"level_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"name" text NOT NULL,
	"component" "exercise_component" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"media_url" text,
	"minutes" integer NOT NULL,
	"materials" text DEFAULT '' NOT NULL,
	"space" text DEFAULT '' NOT NULL,
	"shared" boolean DEFAULT true NOT NULL,
	"owner_user_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"date" date NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"exercise_id" uuid,
	"title" text NOT NULL,
	"phase" "plan_phase" NOT NULL,
	"position" integer NOT NULL,
	"minutes" integer NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "session_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"plan_id" uuid,
	"fulfilled" "plan_fulfillment" NOT NULL,
	"rpe" smallint NOT NULL,
	"minutes" integer NOT NULL,
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_reports_rpe_ck" CHECK ("session_reports"."rpe" between 0 and 10)
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_plan_id_session_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."session_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plan_items" ADD CONSTRAINT "session_plan_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plan_items" ADD CONSTRAINT "session_plan_items_plan_id_session_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."session_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plan_items" ADD CONSTRAINT "session_plan_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reports" ADD CONSTRAINT "session_reports_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reports" ADD CONSTRAINT "session_reports_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reports" ADD CONSTRAINT "session_reports_plan_id_session_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."session_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reports" ADD CONSTRAINT "session_reports_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_school_idx" ON "exercises" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_assignments_group_date_uq" ON "plan_assignments" USING btree ("group_id","date");--> statement-breakpoint
CREATE INDEX "session_plan_items_plan_idx" ON "session_plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "session_plans_school_idx" ON "session_plans" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_reports_session_uq" ON "session_reports" USING btree ("session_id");