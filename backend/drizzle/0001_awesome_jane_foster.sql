CREATE TABLE "interest_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tag_name" text NOT NULL,
	"event_type" text NOT NULL,
	"event_date" date NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interest_events" ADD CONSTRAINT "interest_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interest_events_user_tag_day_idx" ON "interest_events" USING btree ("user_id","tag_name","event_date");--> statement-breakpoint
CREATE INDEX "interest_events_date_tag_idx" ON "interest_events" USING btree ("event_date","tag_name");