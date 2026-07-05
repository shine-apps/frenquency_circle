import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { locations, users } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { publishRateLimiter } from "@/lib/rate-limit/publish"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * 定位发布请求体 schema。
 * - latitude: -90 到 90
 * - longitude: -180 到 180
 * - address: 1-200 字符
 * - tagIds: 1-10 个 uuid
 * - rangeKm: 1 / 5 / 10 / 30 四档
 */
const publishSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().min(1).max(200),
  tagIds: z.array(z.string().uuid()).min(1).max(10),
  rangeKm: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(30)]),
})

/**
 * POST /api/locations/publish
 *
 * 发布当前位置,写入 locations 表并更新 users 表的最新位置。
 * 同一用户 5 分钟内只能发布 1 次,超限返回 429。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = publishSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const { latitude, longitude, address, tagIds, rangeKm } = parsed.data

  // 3. 频率限制
  const limitResult = publishRateLimiter.checkAndConsumePublish(userId)
  if (!limitResult.ok) {
    logger.warn(LOG_PREFIX.MATCH, "Publish rejected: rate limited", {
      userId,
      retryAfterSeconds: limitResult.retryAfterSeconds,
    })
    return withCors(
      fail(
        429,
        `发布过于频繁,请 ${limitResult.retryAfterSeconds} 秒后重试`
      ),
      req
    )
  }

  // 4. 插入 locations 记录
  const [locationRow] = await db
    .insert(locations)
    .values({
      userId,
      latitude,
      longitude,
      address,
      tagIds,
      rangeKm,
    })
    .returning({ id: locations.id, publishedAt: locations.publishedAt })

  // 5. 更新 users 表的最新位置与活跃时间
  await db
    .update(users)
    .set({
      latitude,
      longitude,
      address,
      lastActiveAt: new Date(),
    })
    .where(eq(users.id, userId))

  logger.info(LOG_PREFIX.MATCH, "Location published", {
    userId,
    locationId: locationRow.id,
    rangeKm,
  })

  return withCors(
    ok(
      {
        locationId: locationRow.id,
        publishedAt: locationRow.publishedAt.toISOString(),
      },
      { status: 201 }
    ),
    req
  )
}
