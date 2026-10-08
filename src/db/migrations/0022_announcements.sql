CREATE TABLE "announcement_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"guardian_id" uuid,
	"athlete_id" uuid,
	"user_id" uuid,
	"name" text NOT NULL,
	"phone" text,
	"message" text NOT NULL,
	"whatsapp_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"author_user_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" jsonb NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"pinned_until" date,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_recipients_announcement_idx" ON "announcement_recipients" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "announcement_recipients_guardian_idx" ON "announcement_recipients" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "announcements_school_idx" ON "announcements" USING btree ("school_id","created_at");