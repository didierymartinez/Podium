CREATE TABLE "session_athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "substitute_coach_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "rescheduled_to_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "session_athletes" ADD CONSTRAINT "session_athletes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_athletes" ADD CONSTRAINT "session_athletes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_athletes" ADD CONSTRAINT "session_athletes_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_athletes_uq" ON "session_athletes" USING btree ("session_id","athlete_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_substitute_coach_id_coaches_id_fk" FOREIGN KEY ("substitute_coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_rescheduled_to_id_sessions_id_fk" FOREIGN KEY ("rescheduled_to_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;