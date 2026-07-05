import { z } from "zod"

import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { listPopularTags, searchTags } from "@/lib/search/tag-search"
import type { TagDTO } from "@/types/api"

/**
 * 查询参数 schema。
 * - `q`:可选,搜索关键词
 * - `limit`:可选,默认 10,最大 50,zod coerce 自动把字符串转数字
 */
const searchQuerySchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

/**
 * GET /api/tags/search
 *
 * 标签搜索接口(公开,不需要鉴权)。
 *
 * - `q` 为空或未提供:返回热门标签 top N(目前按 createdAt 排序,后续可改为 searchCount)
 * - `q` 非空:调 `searchTags(q, limit)`,内部按 5 个策略合并去重
 *
 * 响应:`IResponse<{ list: TagDTO[] }>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const raw = {
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  }
  const parsed = searchQuerySchema.safeParse(raw)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid query parameters", parsed.error.flatten()),
      req
    )
  }

  const { q, limit } = parsed.data

  let list: TagDTO[]
  if (!q) {
    list = await listPopularTags(limit)
  } else {
    list = await searchTags(q, limit)
  }

  return withCors(ok({ list }), req)
}
