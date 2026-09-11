/**
 * 会话(JWT)有效期配置。
 *
 * 单一事实来源:`auth.config.ts` 用它设置 `session.maxAge`,
 * Token 模式登录响应(见 `lib/auth/token-login.ts`)用它回传 `expiresIn`,
 * 避免前后端各写一份导致「token 实际有效 30 天、前端却判定 1 天过期」。
 *
 * 可用 `AUTH_SESSION_MAX_AGE_SECONDS` 覆盖,默认 30 天(@auth/core 默认值)。
 */

const DEFAULT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function readMaxAgeSeconds(): number {
  const raw = process.env.AUTH_SESSION_MAX_AGE_SECONDS
  if (!raw) return DEFAULT_SESSION_MAX_AGE_SECONDS
  const n = Number(raw)
  return Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : DEFAULT_SESSION_MAX_AGE_SECONDS
}

/** 会话有效期(秒) */
export const SESSION_MAX_AGE_SECONDS = readMaxAgeSeconds()
