CREATE TYPE "public"."file_kind" AS ENUM('SCHOOL_LOGO', 'ATHLETE_PHOTO', 'ATHLETE_DOCUMENT', 'COACH_CERTIFICATE', 'PAYMENT_PROOF');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('PENDING', 'READY');--> statement-breakpoint
CREATE TYPE "public"."image_consent" AS ENUM('GRANTED', 'DENIED');--> statement-breakpoint
CREATE TABLE "athlete_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"file_id" uuid,
	"issued_on" date NOT NULL,
	"expires_on" date,
	"notes" text,
	"received_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issued_on" date,
	"expires_on" date,
	"file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"validity_months" smallint,
	"active" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" "file_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"original_name" text NOT NULL,
	"status" "file_status" DEFAULT 'PENDING' NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "athletes" ADD COLUMN "photo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "athletes" ADD COLUMN "image_consent" "image_consent";--> statement-breakpoint
ALTER TABLE "athletes" ADD COLUMN "image_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "logo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_certifications" ADD CONSTRAINT "coach_certifications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_certifications" ADD CONSTRAINT "coach_certifications_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_certifications" ADD CONSTRAINT "coach_certifications_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_documents_athlete_type_uq" ON "athlete_documents" USING btree ("athlete_id","document_type_id");--> statement-breakpoint
CREATE INDEX "coach_certifications_coach_idx" ON "coach_certifications" USING btree ("coach_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_types_school_name_uq" ON "document_types" USING btree ("school_id","name");--> statement-breakpoint
CREATE INDEX "files_school_idx" ON "files" USING btree ("school_id","kind");--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;