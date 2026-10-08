CREATE TYPE "public"."charge_kind" AS ENUM('MONTHLY', 'ENROLLMENT', 'ONE_TIME', 'PREVIOUS_BALANCE', 'LATE_FEE');--> statement-breakpoint
CREATE TYPE "public"."credit_note_kind" AS ENUM('ADJUSTMENT', 'EARLY_PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('PENDING', 'PARTIAL', 'PAID', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_status" AS ENUM('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'TRANSFER', 'DEPOSIT', 'CARD', 'ONLINE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CONFIRMED', 'VOID');--> statement-breakpoint
CREATE TABLE "charge_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_amount" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" "credit_note_kind" NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" charge_kind NOT NULL,
	"athlete_id" uuid,
	"enrollment_id" uuid,
	"period" text,
	"description" text NOT NULL,
	"base_amount" integer NOT NULL,
	"sibling_discount" integer DEFAULT 0 NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"code" text NOT NULL,
	"guardian_id" uuid NOT NULL,
	"period" text,
	"issued_on" date NOT NULL,
	"due_on" date NOT NULL,
	"status" "invoice_status" DEFAULT 'PENDING' NOT NULL,
	"total" integer NOT NULL,
	"credited" integer DEFAULT 0 NOT NULL,
	"paid" integer DEFAULT 0 NOT NULL,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"provider" text DEFAULT 'wompi' NOT NULL,
	"environment" text NOT NULL,
	"public_key" text NOT NULL,
	"private_key_encrypted" text NOT NULL,
	"events_secret_encrypted" text NOT NULL,
	"integrity_secret_encrypted" text NOT NULL,
	"merchant_name" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_accounts_school_id_unique" UNIQUE("school_id")
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"invoice_ids" uuid[] NOT NULL,
	"amount" integer NOT NULL,
	"status" "payment_intent_status" DEFAULT 'PENDING' NOT NULL,
	"provider_transaction_id" text,
	"payment_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"code" text NOT NULL,
	"guardian_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"paid_on" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"proof_file_id" uuid,
	"notes" text,
	"status" "payment_status" DEFAULT 'CONFIRMED' NOT NULL,
	"provider_transaction_id" text,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charge_concepts" ADD CONSTRAINT "charge_concepts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_file_id_files_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "charge_concepts_school_name_uq" ON "charge_concepts" USING btree ("school_id","name");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_early_payment_uq" ON "credit_notes" USING btree ("invoice_id") WHERE "credit_notes"."kind" = 'EARLY_PAYMENT';--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_monthly_uq" ON "invoice_lines" USING btree ("enrollment_id","period") WHERE "invoice_lines"."kind" = 'MONTHLY';--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_late_fee_uq" ON "invoice_lines" USING btree ("invoice_id") WHERE "invoice_lines"."kind" = 'LATE_FEE';--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_enrollment_fee_uq" ON "invoice_lines" USING btree ("enrollment_id") WHERE "invoice_lines"."kind" = 'ENROLLMENT';--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_athlete_idx" ON "invoice_lines" USING btree ("athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_school_number_uq" ON "invoices" USING btree ("school_id","number");--> statement-breakpoint
CREATE INDEX "invoices_guardian_idx" ON "invoices" USING btree ("guardian_id","status");--> statement-breakpoint
CREATE INDEX "invoices_school_due_idx" ON "invoices" USING btree ("school_id","status","due_on");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_intents_school_status_idx" ON "payment_intents" USING btree ("school_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_school_number_uq" ON "payments" USING btree ("school_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_tx_uq" ON "payments" USING btree ("school_id","provider_transaction_id") WHERE "payments"."provider_transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_guardian_idx" ON "payments" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "payments_school_date_idx" ON "payments" USING btree ("school_id","paid_on");