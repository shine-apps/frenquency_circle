import { z } from "zod"

import { corsOptions, fail, ok, withCors, parsePagination } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { matchCircles } from "@/lib/match/circle-matcher"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * GET /api/locations/match-circles
 *
 * 查询参数同 match-people,返回 Paginated<MatchCircleDTO>。
 */
const matchQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  tagIds: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean)),
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
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

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
    tagIds: url.searchParams.get("tagIds") ?? undefined,
    rangeKm: url.searchParams.get("rangeKm") ?? undefined,
  })
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid query parameters", parsed.error.flatten()),
      req
    )
  }

  const { latitude, longitude, tagIds, rangeKm } = parsed.data

  // 4. 调用匹配引擎
  const result = await matchCircles({
    lat: latitude,
    lng: longitude,
    tagIds,
    rangeKm,
    page: pagination.page,
    pageSize: pagination.pageSize,
  })

  logger.info(LOG_PREFIX.MATCH, "Match circles queried", {
    rangeKm,
    total: result.total,
  })

  return withCors(ok(result), req)
}
