import { z } from "zod"

import { corsOptions, fail, ok, withCors, parsePagination } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { searchCircles } from "@/lib/search/circle-search"
import { logger } from "@/lib/logger"

/**
 * 查询参数 schema。
 * - `q`:必填,搜索关键词,trim 后 1-100 字符
 * - `tags`:可选,逗号分隔的标签名称(hobby_tags.name),最多 50 个
 * - `page` / `pageSize`:分页(由 parsePagination 处理)
 */
const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  tags: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((t) => t.trim()).filter(Boolean) : []))
    .pipe(z.array(z.string().min(1).max(30)).max(50)),
})

/**
 * GET /api/circles/search
 *
 * 按关键词分页搜索同频圈子。
 *
 * - 鉴权:任意登录用户
 * - 关键词支持 5 策略模糊匹配(精确 → ILIKE → 拼音全拼 → 拼音首字母 → 拼音首字母前缀)
 * - tags 提供时,仅返回拥有至少一个指定标签名称的圈子
 * - 仅返回 `status='active'` 的圈子
 *
 * 响应:`IResponse<Paginated<CircleSearchResultDTO>>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析分页参数
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }

  // 3. 解析并校验查询参数
  const parsed = searchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    tags: url.searchParams.get("tags") ?? undefined,
  })
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid query parameters", parsed.error.flatten()),
      req
    )
  }

  const { q, tags } = parsed.data

  // 4. 调用圈子搜索引擎
  const result = await searchCircles({
    q,
    tags,
    page: pagination.page,
    pageSize: pagination.pageSize,
  })

  logger.info("SEARCH", "Circles searched", {
    userId,
    q,
    tagCount: tags.length,
    total: result.total,
  })

  return withCors(ok(result), req)
}
