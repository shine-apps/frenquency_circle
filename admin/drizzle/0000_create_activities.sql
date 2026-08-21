-- 手动编写的 drizzle 迁移(替代 drizzle-kit generate)
-- 与 db/schema.ts 中 activities 表保持一致。
-- 应用方式: 设置 DATABASE_URL 后运行 `node db/migrate.mjs`(drizzle-orm migrator)。

CREATE TABLE IF NOT EXISTS "activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "circle_id" uuid NOT NULL,
  "creator_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "start_time" timestamp with time zone NOT NULL,
  "registration_deadline" timestamp with time zone NOT NULL,
  "contact_phone" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "activities_circle_fk" FOREIGN KEY ("circle_id") REFERENCES "circles" ("id") ON DELETE CASCADE,
  CONSTRAINT "activities_creator_fk" FOREIGN KEY ("creator_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "activities_deadline_before_start" CHECK (registration_deadline < start_time)
);

CREATE INDEX IF NOT EXISTS "activities_circle_idx" ON "activities" ("circle_id");
CREATE INDEX IF NOT EXISTS "activities_creator_idx" ON "activities" ("creator_id");
CREATE INDEX IF NOT EXISTS "activities_status_idx" ON "activities" ("status");
CREATE INDEX IF NOT EXISTS "activities_start_time_idx" ON "activities" ("start_time");
