ALTER TABLE "securities" ADD COLUMN "listed_shares" bigint;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "sec_type" text;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "listing_date" date;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "info_fetched_at" timestamp with time zone;