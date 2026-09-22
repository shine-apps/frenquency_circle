import type { NextRequest } from "next/server"
import { z } from "zod"

import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { searchTags } from "@/lib/search/tag-search"

/**
 * GET /api/admin/mbti/hobby-tags?q=&limit=
 *
 * 管理后台标签库检索(供推荐概率矩阵选择标签),复用 searchTags 多策略搜索
 * (仅返回 status='approved' 的标签)。
 * 注意:q 为空时 searchTags 直接返回空列表,前端需自行判断是否发起请求。
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const parsed = z
    .object({
      q: z.string().trim().optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
    })
    .safeParse({
      q: req.nextUrl.searchParams.get("q") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    })
  if (!parsed.success) {
    return fail(400, "Invalid query parameters", parsed.error.flatten())
  }

  const q = parsed.data.q ?? ""
  const list = await searchTags(q, parsed.data.limit ?? 20)
  return ok({ list })
}
