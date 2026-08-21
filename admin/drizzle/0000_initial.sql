-- 手动编写的 drizzle 初始迁移(合并自历史迁移,替代 drizzle-kit generate)
-- 与 db/schema.ts 保持一致,包含全部数据表。
-- 应用方式: 设置 DATABASE_URL 后运行 `node db/migrate.mjs`(drizzle-orm migrator)。
-- 说明: 所有语句均带 IF NOT EXISTS,可在已部署数据库上安全重跑(幂等)。

CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"type" text DEFAULT 'credentials' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"level" integer NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "categories_level_check" CHECK ("level" in (1, 2)),
	CONSTRAINT "categories_level_parent_check" CHECK (("level" = 1 and "parent_id" is null) or ("level" = 2 and "parent_id" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circle_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circle_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circles" (
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
CREATE TABLE IF NOT EXISTS "contact_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hobby_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"pinyin" text,
	"pinyin_initials" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hobby_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sms_verification_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teacher_applications" (
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
CREATE TABLE IF NOT EXISTS "users" (
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
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity_type" text,
	"entity_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"link_url" text,
	"link_target" text DEFAULT 'miniprogram' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"registration_deadline" timestamp with time zone NOT NULL,
	"contact_phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_deadline_before_start" CHECK (registration_deadline < start_time)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT IF NOT EXISTS "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT IF NOT EXISTS "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_follows" ADD CONSTRAINT IF NOT EXISTS "circle_follows_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_follows" ADD CONSTRAINT IF NOT EXISTS "circle_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT IF NOT EXISTS "circle_members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT IF NOT EXISTS "circle_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT IF NOT EXISTS "circles_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_logs" ADD CONSTRAINT IF NOT EXISTS "contact_logs_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_logs" ADD CONSTRAINT IF NOT EXISTS "contact_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hobby_tags" ADD CONSTRAINT IF NOT EXISTS "hobby_tags_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hobby_tags" ADD CONSTRAINT IF NOT EXISTS "hobby_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT IF NOT EXISTS "teacher_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT IF NOT EXISTS "teacher_applications_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT IF NOT EXISTS "teacher_applications_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT IF NOT EXISTS "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT IF NOT EXISTS "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT IF NOT EXISTS "activities_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_account_idx" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_parent_name_idx" ON "categories" USING btree ("parent_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_parent_sort_idx" ON "categories" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "circle_follows_circle_user_idx" ON "circle_follows" USING btree ("circle_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_follows_user_idx" ON "circle_follows" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "circle_members_circle_user_idx" ON "circle_members" USING btree ("circle_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circles_creator_idx" ON "circles" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circles_status_idx" ON "circles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circles_location_idx" ON "circles" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circles_tags_gin_idx" ON "circles" USING gin ("tags");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_logs_circle_idx" ON "contact_logs" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_logs_user_idx" ON "contact_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hobby_tags_name_idx" ON "hobby_tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hobby_tags_pinyin_idx" ON "hobby_tags" USING btree ("pinyin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hobby_tags_pinyin_initials_idx" ON "hobby_tags" USING btree ("pinyin_initials");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hobby_tags_category_name_idx" ON "hobby_tags" USING btree ("category_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hobby_tags_status_idx" ON "hobby_tags" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_verification_codes_phone_idx" ON "sms_verification_codes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_applications_user_idx" ON "teacher_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_applications_circle_idx" ON "teacher_applications" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_applications_status_idx" ON "teacher_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_tags_gin_idx" ON "users" USING gin ("tags");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_read_idx" ON "notifications" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_entity_idx" ON "notifications" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_creator_idx" ON "activities" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_status_idx" ON "activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_start_time_idx" ON "activities" USING btree ("start_time");
