import { corsOptions, ok, withCors } from "@/lib/api"
import { getSystemSettingsCached } from "@/lib/settings"

/**
 * GET /api/settings
 *
 * 系统设置公开接口(无需登录)。
 *
 * - 走 `lib/settings.ts` 的缓存读取(60s TTL,管理员 PATCH 后立即失效);
 * - `value` 为 JSONB,原样透传(对象 / 数组 / 原始值),不做字符串化;
 * - H5 跨域需要 CORS 头,故返回 `withCors(ok(list), req)`;小程序端不受影响。
 *
 * 响应:`IResponse<SystemSettingDTO[]>`
 */
export function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const list = await getSystemSettingsCached()
  return withCors(ok(list), req)
}
