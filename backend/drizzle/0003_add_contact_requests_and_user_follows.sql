CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_logs" ALTER COLUMN "circle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_logs" ADD COLUMN "target_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wechat" text;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_requests_pending_pair_idx" ON "contact_requests" USING btree ("from_user_id","to_user_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "contact_requests_to_status_idx" ON "contact_requests" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE INDEX "contact_requests_from_status_idx" ON "contact_requests" USING btree ("from_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_follows_user_target_idx" ON "user_follows" USING btree ("user_id","target_user_id");--> statement-breakpoint
CREATE INDEX "user_follows_user_idx" ON "user_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_follows_target_idx" ON "user_follows" USING btree ("target_user_id");--> statement-breakpoint
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_logs_target_idx" ON "contact_logs" USING btree ("target_user_id");--> statement-breakpoint
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_target_check" CHECK ("circle_id" is not null or "target_user_id" is not null);