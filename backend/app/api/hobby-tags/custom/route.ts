import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { hobbyTags, categories } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { toPinyin, toPinyinInitials } from "@/lib/search/pinyin"
import { toTagDTO } from "@/lib/search/tag-search"

/**
 * 自定义标签请求体 schema。
 * - name: 1-30 字符,trim 后校验
 * - categorySlug: 必填,用户所选分类(一级叶子或二级中类)的稳定 slug;
 *   自定义标签必须归属到一个真实存在的分类节点
 */
const createCustomTagSchema = z.object({
  name: z.string().trim().min(1).max(30),
  categorySlug: z.string().trim().min(1).max(64),
})

/**
 * POST /api/hobby-tags/custom
 *
 * 用户自定义标签创建接口(需登录)。
 *
 * - zod 校验 `name`(1-30 字符,trim)、必填 `categorySlug`(分类稳定键,可为一级或二级)
 * - 用 `toPinyin` 与 `toPinyinInitials` 自动计算 pinyin 字段
 * - 通过 `categorySlug` 解析出 `categoryId`;分类不存在则返回 400
 * - 设置 `status='pending'`、`createdBy=当前用户ID`
 * - 插入 `hobby_tags` 表(若 name 已存在则返回 409)
 * - 返回 `IResponse<TagDTO>`(包含新创建的 tagId)
 *
 * 自定义标签立即可用于匹配(spec 要求:用户提交后立即可用),
 * 后续审核通过后状态变 `approved`(由管理后台触发,本接口不处理)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 鉴权(需登录)
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = createCustomTagSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const name = parsed.data.name
  const categorySlug = parsed.data.categorySlug

  // 3. 解析所属分类(可为 level=1 叶子大类或 level=2 二级中类)
  const subCat = await db.query.categories.findFirst({
    where: eq(categories.slug, categorySlug),
  })
  if (!subCat) {
    return withCors(fail(400, "所属分类不存在"), req)
  }

  // 4. 检查 name 是否已存在(任何状态都视为冲突,避免重复创建)
  const existing = await db.query.hobbyTags.findFirst({
    where: eq(hobbyTags.name, name),
  })
  if (existing) {
    return withCors(fail(409, "标签名已存在"), req)
  }

  // 5. 计算拼音字段
  const pinyinFull = toPinyin(name)
  const pinyinInit = toPinyinInitials(name)

  // 6. 插入 hobby_tags 表
  const [created] = await db
    .insert(hobbyTags)
    .values({
      name,
      categoryId: subCat.id,
      pinyin: pinyinFull,
      pinyinInitials: pinyinInit,
      status: "pending",
      createdBy: userId,
    })
    .returning()

  if (!created) {
    logger.error(LOG_PREFIX.AUTH, "custom tag: insert failed", {
      name,
      userId,
    })
    return withCors(fail(500, "标签创建失败"), req)
  }

  logger.info(LOG_PREFIX.AUTH, "custom tag created", {
    tagId: created.id,
    name,
    userId,
  })

  return withCors(ok(toTagDTO(created)), req)
}
