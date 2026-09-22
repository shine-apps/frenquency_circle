import { z } from "zod"

import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import {
  getRecentCourseProgress,
  RECENT_PROGRESS_LIMIT_MAX,
} from "@/lib/courses"

/**
 * `?limit=` 查询 schema。
 *
 * - 默认 20(覆盖 me 页二级列表的典型展示量);
 * - 上限对齐 {@link RECENT_PROGRESS_LIMIT_MAX},与 lib 层防滥用口径一致。
 */
const querySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(RECENT_PROGRESS_LIMIT_MAX)
    .default(20),
})

/**
 * GET /api/users/me/courses/recent
 *
 * "最近学习"列表(按用户最近播放时间,聚合到课程粒度)。
 *
 * - 鉴权:任意登录用户(只查自己的进度)
 * - 窗口:最近 90 天(由 lib 层 {@link getRecentCourseProgress} 限定)
 * - 过滤:已下线 / 已删除的课程不返回
 * - 字段:每条带课程概要 + 上次播放的课时(id / 标题 / sortOrder) + 播放位置 + 时间
 * - 返回 `IResponse<{ list: RecentCourseDTO[] }>`
 *
 * 注意:这是用户私有数据,不分页(单用户最近窗口内数据量天然有限),
 * 上限 50 条由后端兜底,前端无需管理页码。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析查询参数
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) {
    return withCors(fail(400, "limit 参数不合法"), req)
  }

  // 3. 拉取
  const list = await getRecentCourseProgress(userId, { limit: parsed.data.limit })
  return withCors(ok({ list }), req)
}