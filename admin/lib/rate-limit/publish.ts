/**
 * 定位发布频率限制器(进程内 Map + TTL)。
 *
 * 限制规则:
 * - 同一用户在冷却时间内(默认 300 秒 / 5 分钟)只能 publish 1 次
 * - 冷却时间可通过 env `PUBLISH_RATE_COOLDOWN_SECONDS` 调整
 *
 * 已知限制:进程本地存储,重启后重置;不支持多实例部署。
 * 如需多实例,可替换为 Redis 实现。
 */

export type PublishLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number }

function envInt(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function cooldownMs(): number {
  return envInt("PUBLISH_RATE_COOLDOWN_SECONDS", 300) * 1000
}

class PublishRateLimiter {
  private buckets = new Map<string, number>()

  /**
   * 检查并消费一次发布配额。
   * 调用即视为尝试发布,成功时会计入冷却。
   */
  checkAndConsumePublish(userId: string): PublishLimitResult {
    const now = Date.now()
    const cooldown = cooldownMs()
    const lastPublishAt = this.buckets.get(userId)

    if (lastPublishAt !== undefined) {
      const elapsed = now - lastPublishAt
      if (elapsed < cooldown) {
        const retryAfterSeconds = Math.ceil((cooldown - elapsed) / 1000)
        return { ok: false, retryAfterSeconds }
      }
    }

    this.buckets.set(userId, now)
    return { ok: true }
  }

  /**
   * 仅供测试使用:重置所有内部状态。
   */
  __resetForTest(): void {
    this.buckets.clear()
  }
}

export const publishRateLimiter = new PublishRateLimiter()
