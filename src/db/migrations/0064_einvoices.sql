CREATE TYPE "public"."einvoice_status" AS ENUM('PENDING', 'ISSUED', 'ERROR');--> statement-breakpoint
CREATE TABLE "einvoice_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"provider" text DEFAULT 'alegra' NOT NULL,
	"username" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"item_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "einvoice_accounts_school_id_unique" UNIQUE("school_id")
);
--> statement-breakpoint
CREATE TABLE "einvoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "einvoice_status" DEFAULT 'PENDING' NOT NULL,
	"external_id" text,
	"number" text,
	"cufe" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "einvoices_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
ALTER TABLE "einvoice_accounts" ADD CONSTRAINT "einvoice_accounts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoices" ADD CONSTRAINT "einvoices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoices" ADD CONSTRAINT "einvoices_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "einvoices_school_status_idx" ON "einvoices" USING btree ("school_id","status");