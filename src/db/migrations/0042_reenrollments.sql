CREATE TABLE "reenrollment_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"amount" integer NOT NULL,
	"due_on" date NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reenrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"invoice_id" uuid,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "reenrollment_campaigns" ADD CONSTRAINT "reenrollment_campaigns_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrollment_campaigns" ADD CONSTRAINT "reenrollment_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrollments" ADD CONSTRAINT "reenrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrollments" ADD CONSTRAINT "reenrollments_campaign_id_reenrollment_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."reenrollment_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrollments" ADD CONSTRAINT "reenrollments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrollments" ADD CONSTRAINT "reenrollments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrollments" ADD CONSTRAINT "reenrollments_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reenrollment_campaigns_year_uq" ON "reenrollment_campaigns" USING btree ("school_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX "reenrollments_campaign_athlete_uq" ON "reenrollments" USING btree ("campaign_id","athlete_id");