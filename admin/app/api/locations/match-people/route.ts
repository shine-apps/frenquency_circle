import { z } from "zod"

import { corsOptions, fail, ok, withCors, parsePagination } from "@/lib/api"
import { matchPeople } from "@/lib/match/people-matcher"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { readUserFromToken } from "@/lib/auth/session-token"

/**
 * GET /api/locations/match-people
 *
 * 查询参数:
 * - latitude / longitude: 坐标(数值)
 * - tags: 逗号分隔的标签名称字符串(hobby_tags.name),可选;缺省时按距离/活跃度推荐
 * - rangeKm: 1 / 5 / 10 / 30(默认 5)
 * - page / pageSize: 分页(默认 1 / 20)
 *
 * 返回 Paginated<MatchPersonDTO>。
 */
const matchQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  tags: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((t) => t.trim()).filter(Boolean) : []
    ),
  rangeKm: z
    .coerce.number()
    .pipe(
      z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(30)])
    )
    .default(5),
})

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 尝试读取登录用户(可选):登录时排除自身,游客未登录则不强校验
  const authUser = await readUserFromToken(req)
  const currentUserId = authUser?.id

  // 2. 解析分页参数
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }

  // 3. 解析并校验查询参数
  const parsed = matchQuerySchema.safeParse({
    latitude: url.searchParams.get("latitude") ?? undefined,
    longitude: url.searchParams.get("longitude") ?? undefined,
    tags: url.searchParams.get("tags") ?? undefined,
    rangeKm: url.searchParams.get("rangeKm") ?? undefined,
  })
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid query parameters", parsed.error.flatten()),
      req
    )
  }

  const { latitude, longitude, tags, rangeKm } = parsed.data

  // 4. 调用匹配引擎
  const result = await matchPeople({
    lat: latitude,
    lng: longitude,
    tags,
    rangeKm,
    currentUserId,
    page: pagination.page,
    pageSize: pagination.pageSize,
  })

  logger.info(LOG_PREFIX.MATCH, "Match people queried", {
    userId: currentUserId ?? "guest",
    rangeKm,
    total: result.total,
  })

  return withCors(ok(result), req)
}
