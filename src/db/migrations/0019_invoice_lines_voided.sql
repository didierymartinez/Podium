DROP INDEX "invoice_lines_monthly_uq";--> statement-breakpoint
DROP INDEX "invoice_lines_enrollment_fee_uq";--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "voided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_monthly_uq" ON "invoice_lines" USING btree ("enrollment_id","period") WHERE "invoice_lines"."kind" = 'MONTHLY' and not "invoice_lines"."voided";--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_enrollment_fee_uq" ON "invoice_lines" USING btree ("enrollment_id") WHERE "invoice_lines"."kind" = 'ENROLLMENT' and not "invoice_lines"."voided";