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
CREATE TABLE "categories" (
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
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hobby_tags" ADD CONSTRAINT "hobby_tags_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hobby_tags" ADD CONSTRAINT "hobby_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_idx" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_parent_name_idx" ON "categories" USING btree ("parent_id","name");--> statement-breakpoint
CREATE INDEX "categories_parent_sort_idx" ON "categories" USING btree ("parent_id","sort_order");--> statement-breakpoint
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
CREATE INDEX "hobby_tags_category_name_idx" ON "hobby_tags" USING btree ("category_id","name");--> statement-breakpoint
CREATE INDEX "hobby_tags_status_idx" ON "hobby_tags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sms_verification_codes_phone_idx" ON "sms_verification_codes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "teacher_applications_user_idx" ON "teacher_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teacher_applications_circle_idx" ON "teacher_applications" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "teacher_applications_status_idx" ON "teacher_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_tags_gin_idx" ON "users" USING gin ("tags");
--> statement-breakpoint

-- 分类树种子数据:一级大类(幂等)
INSERT INTO categories (id, name, slug, level, parent_id, sort_order)
SELECT gen_random_uuid(), '传统技艺', 'traditional', 1, NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'traditional');

INSERT INTO categories (id, name, slug, level, parent_id, sort_order)
SELECT gen_random_uuid(), '传统戏曲', 'opera', 1, NULL, 2
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'opera');

INSERT INTO categories (id, name, slug, level, parent_id, sort_order)
SELECT gen_random_uuid(), '传统舞蹈', 'dance', 1, NULL, 3
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'dance');

INSERT INTO categories (id, name, slug, level, parent_id, sort_order)
SELECT gen_random_uuid(), '琴棋书画', 'scholar', 1, NULL, 4
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'scholar');

INSERT INTO categories (id, name, slug, level, parent_id, sort_order)
SELECT gen_random_uuid(), '传统茶花香', 'tea', 1, NULL, 5
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'tea');

INSERT INTO categories (id, name, slug, level, parent_id, sort_order)
SELECT gen_random_uuid(), '民俗游艺', 'folk', 1, NULL, 6
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'folk');
--> statement-breakpoint

-- 二级中类
INSERT INTO categories (id, name, slug, level, parent_id, sort_order)
SELECT gen_random_uuid(), name, slug, 2, parent_id, sort_order
FROM (VALUES
  ('传统木工','wood',(SELECT id FROM categories WHERE slug = 'traditional'),1),
  ('榫卯营造','mortise',(SELECT id FROM categories WHERE slug = 'traditional'),2),
  ('木雕','woodcarving',(SELECT id FROM categories WHERE slug = 'traditional'),3),
  ('竹编藤编','bamboo',(SELECT id FROM categories WHERE slug = 'traditional'),4),
  ('剪纸皮影','papercut',(SELECT id FROM categories WHERE slug = 'traditional'),5),
  ('泥塑面塑','clay',(SELECT id FROM categories WHERE slug = 'traditional'),6),
  ('刺绣织染','embroidery',(SELECT id FROM categories WHERE slug = 'traditional'),7),
  ('陶瓷烧造','ceramic',(SELECT id FROM categories WHERE slug = 'traditional'),8),
  ('金工锻造','metal',(SELECT id FROM categories WHERE slug = 'traditional'),9),
  ('其他传统技艺','other-traditional',(SELECT id FROM categories WHERE slug = 'traditional'),99),
  ('京剧昆曲','opera-cl',(SELECT id FROM categories WHERE slug = 'opera'),1),
  ('地方戏曲','local-opera',(SELECT id FROM categories WHERE slug = 'opera'),2),
  ('曲艺说唱','quyi',(SELECT id FROM categories WHERE slug = 'opera'),3),
  ('其他传统戏曲','other-opera',(SELECT id FROM categories WHERE slug = 'opera'),99),
  ('民族民间舞','folk-dance',(SELECT id FROM categories WHERE slug = 'dance'),1),
  ('古典舞','classic-dance',(SELECT id FROM categories WHERE slug = 'dance'),2),
  ('其他传统舞蹈','other-dance',(SELECT id FROM categories WHERE slug = 'dance'),99),
  ('书法','calligraphy',(SELECT id FROM categories WHERE slug = 'scholar'),1),
  ('国画','painting',(SELECT id FROM categories WHERE slug = 'scholar'),2),
  ('数字绘画','digital-paint',(SELECT id FROM categories WHERE slug = 'scholar'),3),
  ('其他琴棋书画','other-scholar',(SELECT id FROM categories WHERE slug = 'scholar'),99),
  ('茶道茶艺','tea-craft',(SELECT id FROM categories WHERE slug = 'tea'),1),
  ('花道插花','flower',(SELECT id FROM categories WHERE slug = 'tea'),2),
  ('香道','incense',(SELECT id FROM categories WHERE slug = 'tea'),3),
  ('其他茶花香','other-tea',(SELECT id FROM categories WHERE slug = 'tea'),99),
  ('民俗节庆','folk-festival',(SELECT id FROM categories WHERE slug = 'folk'),1),
  ('游艺竞技','folk-game',(SELECT id FROM categories WHERE slug = 'folk'),2),
  ('手工艺其他','other-folk',(SELECT id FROM categories WHERE slug = 'folk'),99)
) AS v(name, slug, parent_id, sort_order)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- 其他兜底中类(每个一级大类一个)
INSERT INTO categories (id, name, slug, level, parent_id, sort_order)
SELECT
  '10000000-0000-0000-0000-000000000001'::uuid,
  '其他' || t.name,
  'other-' || t.slug,
  2,
  t.id,
  99
FROM categories t
WHERE t.level = 1 AND t.slug NOT IN ('other', 'misc', 'custom-other')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- 全局兜底 + 自定义
INSERT INTO categories (id, name, slug, level, parent_id, sort_order)
VALUES
  ('20000000-0000-0000-0000-000000000019'::uuid, '其他兴趣', 'misc', 1, NULL, 99),
  ('20000000-0000-0000-0000-000000000020'::uuid, '自定义标签', 'custom-other', 1, NULL, 100)
ON CONFLICT (slug) DO NOTHING;