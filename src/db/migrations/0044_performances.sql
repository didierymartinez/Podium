CREATE TYPE "public"."performance_context" AS ENUM('TRAINING', 'CONTROL', 'COMPETITION');--> statement-breakpoint
CREATE TYPE "public"."timing" AS ENUM('MANUAL', 'ELECTRONIC');--> statement-breakpoint
CREATE TABLE "performance_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"age_category_id" uuid NOT NULL,
	"value" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"value" double precision NOT NULL,
	"recorded_on" date NOT NULL,
	"context" "performance_context" NOT NULL,
	"timing" "timing",
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance_targets" ADD CONSTRAINT "performance_targets_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_targets" ADD CONSTRAINT "performance_targets_test_id_sport_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."sport_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_targets" ADD CONSTRAINT "performance_targets_age_category_id_age_categories_id_fk" FOREIGN KEY ("age_category_id") REFERENCES "public"."age_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_test_id_sport_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."sport_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "performance_targets_uq" ON "performance_targets" USING btree ("test_id","age_category_id");--> statement-breakpoint
CREATE INDEX "performances_athlete_test_idx" ON "performances" USING btree ("athlete_id","test_id");