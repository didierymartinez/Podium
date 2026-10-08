ALTER TABLE "notifications" ADD COLUMN "whatsapp_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "whatsapp_message_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "whatsapp_status" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "whatsapp_error" text;--> statement-breakpoint
CREATE INDEX "notifications_whatsapp_idx" ON "notifications" USING btree ("whatsapp_message_id") WHERE "notifications"."whatsapp_message_id" is not null;