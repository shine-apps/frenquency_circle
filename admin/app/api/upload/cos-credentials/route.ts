import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { readUserFromToken } from "@/lib/auth/session-token"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { issueScopedCredentials } from "@/lib/cos/sts"

/** 安全地把 unknown 转为字符串(用于日志) */
function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/**
 * 签发 scoped COS STS 凭证(供客户端直传)。
 *
 * - 鉴权:任意登录用户(`readUserFromToken`,与 /api/upload 一致)
 * - scope:`uploads/<userId>/*`(由 issueScopedCredentials 强制隔离)
 * - TTL:由 `COS_STS_DURATION_SECONDS` 控制(默认 1800s)
 * - 返回 `IResponse<CosCredentials>`,客户端拿到后构造 cos-js-sdk-v5 直传
 *
 * 本路由不参与文件传输,不消耗应用带宽,文件字节不进 Next.js 进程内存。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const authUser = await readUserFromToken(req)
  if (!authUser) {
    return withCors(fail(401, "未登录或登录已过期"), req)
  }

  try {
    const credentials = await issueScopedCredentials(authUser.id)
    logger.info(LOG_PREFIX.UPLOAD, "cos sts issued", {
      userId: authUser.id,
      expiredTime: credentials.expiredTime,
    })
    return withCors(ok(credentials), req)
  } catch (e) {
    logger.error(LOG_PREFIX.UPLOAD, "cos sts failed", {
      err: errMessage(e),
      userId: authUser.id,
    })
    return withCors(fail(500, "Failed to issue COS credentials"), req)
  }
}
