CREATE TYPE "public"."badge" AS ENUM('STREAK', 'CENTURY', 'LEVEL_UP', 'PERSONAL_BEST', 'FIRST_PODIUM', 'ANNIVERSARY');--> statement-breakpoint
CREATE TABLE "athlete_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"badge" "badge" NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"label" text NOT NULL,
	"awarded_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "athlete_badges" ADD CONSTRAINT "athlete_badges_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_badges" ADD CONSTRAINT "athlete_badges_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_badges_uq" ON "athlete_badges" USING btree ("athlete_id","badge","key");