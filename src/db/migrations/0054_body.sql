CREATE TYPE "public"."measurement_source" AS ENUM('MANUAL', 'INBODY');--> statement-breakpoint
CREATE TABLE "body_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"granted_by_user_id" uuid,
	"source" text NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "body_consents_athlete_id_unique" UNIQUE("athlete_id")
);
--> statement-breakpoint
CREATE TABLE "body_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"measured_on" date NOT NULL,
	"source" "measurement_source" NOT NULL,
	"weight_kg" double precision,
	"height_cm" double precision,
	"wingspan_cm" double precision,
	"skeletal_muscle_kg" double precision,
	"body_fat_kg" double precision,
	"body_fat_percent" double precision,
	"visceral_fat" double precision,
	"body_water_kg" double precision,
	"basal_metabolism_kcal" integer,
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initial_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"assessed_on" date NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"sports_background" text DEFAULT '' NOT NULL,
	"health_history_encrypted" text,
	"notes" text DEFAULT '' NOT NULL,
	"assessed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "initial_assessments_athlete_id_unique" UNIQUE("athlete_id")
);
--> statement-breakpoint
ALTER TABLE "body_consents" ADD CONSTRAINT "body_consents_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_consents" ADD CONSTRAINT "body_consents_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_consents" ADD CONSTRAINT "body_consents_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initial_assessments" ADD CONSTRAINT "initial_assessments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initial_assessments" ADD CONSTRAINT "initial_assessments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initial_assessments" ADD CONSTRAINT "initial_assessments_assessed_by_user_id_users_id_fk" FOREIGN KEY ("assessed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "body_measurements_athlete_idx" ON "body_measurements" USING btree ("athlete_id","measured_on");