CREATE TYPE "public"."competition_kind" AS ENUM('LEAGUE', 'FEDERATION', 'INTERCLUB', 'FESTIVAL', 'INTERNAL');--> statement-breakpoint
CREATE TYPE "public"."competition_entry_status" AS ENUM('INVITED', 'ACCEPTED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."medal" AS ENUM('GOLD', 'SILVER', 'BRONZE');--> statement-breakpoint
CREATE TABLE "competition_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"events" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "competition_entry_status" DEFAULT 'INVITED' NOT NULL,
	"warnings" text[] DEFAULT '{}'::text[] NOT NULL,
	"extras" text[] DEFAULT '{}'::text[] NOT NULL,
	"responded_at" timestamp with time zone,
	"responded_by_user_id" uuid,
	"authorization_text" text,
	"authorization_ip" text,
	"invoice_id" uuid,
	"invited_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"event" text NOT NULL,
	"position" integer,
	"mark" text,
	"medal" "medal",
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "competition_kind" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"registration_deadline" date NOT NULL,
	"events" text[] DEFAULT '{}'::text[] NOT NULL,
	"entry_fee" integer DEFAULT 0 NOT NULL,
	"extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"require_no_debt" boolean DEFAULT true NOT NULL,
	"required_document_type_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"authorization_text" text NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_results" ADD CONSTRAINT "competition_results_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_results" ADD CONSTRAINT "competition_results_entry_id_competition_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."competition_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_results" ADD CONSTRAINT "competition_results_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_entries_uq" ON "competition_entries" USING btree ("competition_id","athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_results_uq" ON "competition_results" USING btree ("entry_id","event");--> statement-breakpoint
CREATE INDEX "competitions_school_date_idx" ON "competitions" USING btree ("school_id","starts_on");