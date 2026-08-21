-- 手动编写的 drizzle 迁移(替代 drizzle-kit generate)
-- 与 db/schema.ts 中 activities 表一致:移除与圈子(circle)的关联。
-- 应用方式: 设置 DATABASE_URL 后运行 `node db/migrate.mjs`(drizzle-orm migrator)。

-- 删除 activities 表的 circle_id 列(含自动生成的 circle_id 外键约束与索引)
ALTER TABLE "activities" DROP COLUMN IF EXISTS "circle_id";

-- 删除基于 circle_id 的索引(若仍存在)
DROP INDEX IF EXISTS "activities_circle_idx";
