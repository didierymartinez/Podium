CREATE TYPE "public"."test_context" AS ENUM('TRACK', 'ROAD', 'FIELD');--> statement-breakpoint
CREATE TYPE "public"."test_kind" AS ENUM('TIME', 'DISTANCE', 'POINTS', 'REPS', 'SCORE', 'POSITION');--> statement-breakpoint
CREATE TABLE "sport_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"discipline_id" uuid,
	"name" text NOT NULL,
	"kind" "test_kind" NOT NULL,
	"unit" text NOT NULL,
	"lower_is_better" boolean NOT NULL,
	"context" "test_context" NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "levels" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sport_tests" ADD CONSTRAINT "sport_tests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sport_tests" ADD CONSTRAINT "sport_tests_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sport_tests_school_idx" ON "sport_tests" USING btree ("school_id","discipline_id");