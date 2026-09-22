DROP INDEX "contact_requests_pending_pair_idx";--> statement-breakpoint
ALTER TABLE "contact_requests" ADD COLUMN "pair_key" uuid GENERATED ALWAYS AS (least("from_user_id", "to_user_id")) STORED;--> statement-breakpoint
CREATE INDEX "contact_requests_from_created_idx" ON "contact_requests" USING btree ("from_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_requests_pending_pair_idx" ON "contact_requests" USING btree ("pair_key") WHERE "status" = 'pending';