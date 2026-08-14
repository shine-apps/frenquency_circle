import { z } from "zod"

import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { reverseGeocode } from "@/lib/geo"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * GET /api/geo/reverse
 *
 * 逆地理编码(经纬度 → 地址)。主要供微信小程序端使用;H5 端直接用浏览器高德 JS API。
 * 无需登录:地址是公开地理信息,且密钥在服务端,不存在泄露风险。
 *
 * 查询参数:
 * - latitude: 纬度(gcj02),范围 -90~90
 * - longitude: 经度(gcj02),范围 -180~180
 */
const querySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
})

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    latitude: url.searchParams.get("latitude") ?? undefined,
    longitude: url.searchParams.get("longitude") ?? undefined,
  })
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid coordinates", parsed.error.flatten()),
      req,
    )
  }

  const { latitude, longitude } = parsed.data
  try {
    const result = await reverseGeocode({ lat: latitude, lng: longitude })
    return withCors(ok(result), req)
  }
  catch (err) {
    logger.error(LOG_PREFIX.GEO, "reverse geocode failed", {
      error: String(err),
      latitude,
      longitude,
    })
    return withCors(fail(502, "Reverse geocode failed"), req)
  }
}
