CREATE TYPE "public"."document_type" AS ENUM('NIT', 'CC', 'CE');--> statement-breakpoint
CREATE TABLE "fee_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"monthly_amount" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "document_type" "document_type";--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "document_number" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "brand_color" text DEFAULT '#2f6bff' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_plans_school_idx" ON "fee_plans" USING btree ("school_id");