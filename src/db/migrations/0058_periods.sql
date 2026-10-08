CREATE TYPE "public"."period_kind" AS ENUM('MACRO', 'MESO');--> statement-breakpoint
CREATE TYPE "public"."period_phase" AS ENUM('GENERAL_PREP', 'SPECIFIC_PREP', 'COMPETITIVE', 'TRANSITION');--> statement-breakpoint
CREATE TABLE "training_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"kind" "period_kind" NOT NULL,
	"phase" "period_phase",
	"name" text NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"competition_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_periods" ADD CONSTRAINT "training_periods_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_periods" ADD CONSTRAINT "training_periods_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_periods" ADD CONSTRAINT "training_periods_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_periods" ADD CONSTRAINT "training_periods_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_periods_group_idx" ON "training_periods" USING btree ("group_id","starts_on");