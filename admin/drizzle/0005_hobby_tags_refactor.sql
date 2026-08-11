--> statement-breakpoint
-- 1. 重命名 tags → hobby_tags(二级分类体系)
ALTER TABLE "tags" RENAME TO "hobby_tags";
--> statement-breakpoint
-- 2. 删除旧索引(依赖 sub_category 或旧表名),重建新索引
DROP INDEX IF EXISTS "tags_category_sub_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "tags_name_idx" RENAME TO "hobby_tags_name_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "tags_pinyin_idx" RENAME TO "hobby_tags_pinyin_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "tags_pinyin_initials_idx" RENAME TO "hobby_tags_pinyin_initials_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "tags_status_idx" RENAME TO "hobby_tags_status_idx";
--> statement-breakpoint
CREATE INDEX "hobby_tags_category_name_idx" ON "hobby_tags" USING btree ("category","name");
--> statement-breakpoint
-- 3. 删除 sub_category 列
ALTER TABLE "hobby_tags" DROP COLUMN IF EXISTS "sub_category";
--> statement-breakpoint
-- 4. users / circles 新增 tags 数组列(默认空数组,先加列再回填数据)
ALTER TABLE "users" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
-- 5. locations 列重命名 tag_ids → tag_names(类型不变,仍为数组,元素为 uuid,随后转换)
ALTER TABLE "locations" RENAME COLUMN "tag_ids" TO "tag_names";
--> statement-breakpoint
-- 6. 数据迁移:user_tags JOIN hobby_tags 聚合 name 数组写回 users.tags
UPDATE "users" AS u
SET "tags" = sub.tags
FROM (
	SELECT ut.user_id, array_agg(DISTINCT ht.name ORDER BY ht.name) AS tags
	FROM "user_tags" ut
	JOIN "hobby_tags" ht ON ht.id = ut.tag_id
	GROUP BY ut.user_id
) AS sub
WHERE u.id = sub.user_id;
--> statement-breakpoint
-- 7. 数据迁移:circle_tags JOIN hobby_tags 聚合 name 数组写回 circles.tags
UPDATE "circles" AS c
SET "tags" = sub.tags
FROM (
	SELECT ct.circle_id, array_agg(DISTINCT ht.name ORDER BY ht.name) AS tags
	FROM "circle_tags" ct
	JOIN "hobby_tags" ht ON ht.id = ct.tag_id
	GROUP BY ct.circle_id
) AS sub
WHERE c.id = sub.circle_id;
--> statement-breakpoint
-- 8. 数据迁移:locations.tag_names 由 uuid 快照解析为名称快照(仅处理有值的行)
UPDATE "locations" AS l
SET "tag_names" = COALESCE(
	(
		SELECT array_agg(DISTINCT ht.name ORDER BY ht.name)
		FROM unnest(l.tag_names) AS tid
		JOIN "hobby_tags" ht ON ht.id = tid::uuid
	),
	'{}'::text[]
)
WHERE l.tag_names IS NOT NULL;
--> statement-breakpoint
-- 9. 删除桥接表(数据已迁移到数组列)
DROP TABLE "user_tags";
--> statement-breakpoint
DROP TABLE "circle_tags";
--> statement-breakpoint
-- 10. 数组包含查询 GIN 索引
CREATE INDEX "users_tags_gin_idx" ON "users" USING gin ("tags");
--> statement-breakpoint
CREATE INDEX "circles_tags_gin_idx" ON "circles" USING gin ("tags");
