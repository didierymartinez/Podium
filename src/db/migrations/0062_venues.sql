ALTER TABLE "groups" ADD COLUMN "venue_id" uuid;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "map_url" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;