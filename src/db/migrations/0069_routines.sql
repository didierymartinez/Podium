CREATE TABLE "routine_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"exercise_id" uuid,
	"name" text NOT NULL,
	"sets" integer NOT NULL,
	"reps" text NOT NULL,
	"weight_kg" double precision,
	"rest_seconds" integer,
	"notes" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"routine_day_id" uuid,
	"performed_on" date NOT NULL,
	"notes" text,
	"by_family" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"log_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"exercise_name" text NOT NULL,
	"set_number" integer NOT NULL,
	"reps" integer NOT NULL,
	"weight_kg" double precision
);
--> statement-breakpoint
ALTER TABLE "routine_days" ADD CONSTRAINT "routine_days_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_days" ADD CONSTRAINT "routine_days_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_day_id_routine_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."routine_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_routine_day_id_routine_days_id_fk" FOREIGN KEY ("routine_day_id") REFERENCES "public"."routine_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_log_id_workout_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."workout_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routines_athlete_idx" ON "routines" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "workout_logs_athlete_idx" ON "workout_logs" USING btree ("athlete_id","performed_on");--> statement-breakpoint
CREATE INDEX "workout_sets_log_idx" ON "workout_sets" USING btree ("log_id");