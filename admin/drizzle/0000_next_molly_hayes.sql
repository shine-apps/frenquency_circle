CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"type" text DEFAULT 'credentials' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"address" text NOT NULL,
	"contact_phone" text,
	"wechat" text,
	"activity_time" text,
	"max_members" integer,
	"member_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"cover_images" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hobby_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"pinyin" text,
	"pinyin_initials" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"address" text NOT NULL,
	"tag_names" text[],
	"range_km" integer NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_verification_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"circle_id" uuid,
	"files" jsonb NOT NULL,
	"id_card_front" jsonb,
	"id_card_back" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'USER' NOT NULL,
	"avatar_url" text,
	"phone" text,
	"wechat_openid" text,
	"latitude" double precision,
	"longitude" double precision,
	"address" text,
	"privacy_settings" jsonb DEFAULT '{"allowMatch":true,"publicContact":true,"locationPrecision":"exact"}'::jsonb NOT NULL,
	"practice_years" integer,
	"activity_level" text DEFAULT 'medium' NOT NULL,
	"last_active_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hobby_tags" ADD CONSTRAINT "hobby_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_idx" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_members_circle_user_idx" ON "circle_members" USING btree ("circle_id","user_id");--> statement-breakpoint
CREATE INDEX "circles_creator_idx" ON "circles" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "circles_status_idx" ON "circles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "circles_location_idx" ON "circles" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "circles_tags_gin_idx" ON "circles" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "contact_logs_circle_idx" ON "contact_logs" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "contact_logs_user_idx" ON "contact_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hobby_tags_name_idx" ON "hobby_tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "hobby_tags_pinyin_idx" ON "hobby_tags" USING btree ("pinyin");--> statement-breakpoint
CREATE INDEX "hobby_tags_pinyin_initials_idx" ON "hobby_tags" USING btree ("pinyin_initials");--> statement-breakpoint
CREATE INDEX "hobby_tags_category_name_idx" ON "hobby_tags" USING btree ("category","name");--> statement-breakpoint
CREATE INDEX "hobby_tags_status_idx" ON "hobby_tags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "locations_user_idx" ON "locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "locations_location_idx" ON "locations" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "sms_verification_codes_phone_idx" ON "sms_verification_codes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "teacher_applications_user_idx" ON "teacher_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teacher_applications_circle_idx" ON "teacher_applications" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "teacher_applications_status_idx" ON "teacher_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_tags_gin_idx" ON "users" USING gin ("tags");