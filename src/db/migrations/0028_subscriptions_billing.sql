CREATE TYPE "public"."billing_interval" AS ENUM('MONTHLY', 'ANNUAL');--> statement-breakpoint
CREATE TYPE "public"."platform_invoice_status" AS ENUM('PENDING', 'PAID', 'FAILED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."subscription_method" AS ENUM('CARD', 'LINK');--> statement-breakpoint
CREATE TABLE "platform_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"plan_code" text NOT NULL,
	"interval" "billing_interval" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount" integer NOT NULL,
	"status" "platform_invoice_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"provider_transaction_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_invoices_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "interval" "billing_interval" DEFAULT 'MONTHLY' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "method" "subscription_method";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_source_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "card_label" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "past_due_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "read_only_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "over_limit_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "discount_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "discount_until" date;--> statement-breakpoint
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_invoices_school_idx" ON "platform_invoices" USING btree ("school_id","status");