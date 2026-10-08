CREATE TYPE "public"."collection_note_kind" AS ENUM('CALL', 'MESSAGE', 'VISIT', 'NOTE');--> statement-breakpoint
CREATE TYPE "public"."payment_plan_status" AS ENUM('ACTIVE', 'COMPLETED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."promise_status" AS ENUM('OPEN', 'KEPT', 'BROKEN');--> statement-breakpoint
CREATE TABLE "collection_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"kind" "collection_note_kind" NOT NULL,
	"note" text NOT NULL,
	"promise_on" date,
	"promise_amount" integer,
	"promise_status" "promise_status",
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plan_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"due_on" date NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"total" integer NOT NULL,
	"starts_on" date NOT NULL,
	"status" "payment_plan_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_plan_id_payment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_notes_guardian_idx" ON "collection_notes" USING btree ("guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_plan_installments_uq" ON "payment_plan_installments" USING btree ("plan_id","position");--> statement-breakpoint
CREATE INDEX "payment_plans_guardian_idx" ON "payment_plans" USING btree ("guardian_id","status");