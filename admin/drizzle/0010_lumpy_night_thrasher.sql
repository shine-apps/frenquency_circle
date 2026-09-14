CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text,
	"circle_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"images" text[] DEFAULT '{}'::text[] NOT NULL,
	"video_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_media_exclusive_check" CHECK ("video_url" is null or cardinality("images") = 0),
	CONSTRAINT "checkins_images_max_check" CHECK (cardinality("images") <= 9)
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkins_user_created_idx" ON "checkins" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "checkins_circle_created_idx" ON "checkins" USING btree ("circle_id","created_at");--> statement-breakpoint
CREATE INDEX "checkins_status_created_idx" ON "checkins" USING btree ("status","created_at");