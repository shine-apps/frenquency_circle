import { z } from "zod"

import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { computeHotInterests } from "@/lib/interest-ranking"

/**
 * 查询参数 schema。
 * - `days`:可选,最近 N 天(1-90,默认 30)
 * - `startDate` / `endDate`:可选,YYYY-MM-DD(东八区自然日,含当日),优先于 days
 * - `limit`:可选,默认 10,最大 50,zod coerce 自动把字符串转数字
 */
const hotQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

/**
 * GET /api/interests/hot
 *
 * 热门兴趣列表(公开,不需要鉴权)。
 *
 * - 按时间窗口(最近 N 天或显式起止日期)聚合 `interest_events` 的得分总和,
 *   按得分从高到低返回热门兴趣 Top K。
 * - 响应:`IResponse<{ list: HotInterestDTO[] }>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const raw = {
    days: url.searchParams.get("days") ?? undefined,
    startDate: url.searchParams.get("startDate") ?? undefined,
    endDate: url.searchParams.get("endDate") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  }
  const parsed = hotQuerySchema.safeParse(raw)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid query parameters", parsed.error.flatten()),
      req
    )
  }

  const { days, startDate, endDate, limit } = parsed.data
  const { list } = await computeHotInterests({
    days,
    startDate,
    endDate,
    limit,
  })

  return withCors(ok({ list }), req)
}
