/**
 * 进程内内存限流器（基于 Map + TTL 逻辑窗口）。
 *
 * 限制规则：
 * - 单手机号：60s 冷却 + 每小时最多 N 次（默认 5）
 * - 单 IP：每小时最多 M 次（默认 10）
 *
 * 已知限制：进程本地存储，重启后重置；不支持多实例部署。
 * 如需多实例，可在同一接口下替换为 Redis 实现。
 */

type Bucket = {
  count: number
  firstAt: number
  nextAllowedAt: number
}

type PhoneReason = "cooldown" | "hourly"
type IpReason = "hourly"

export type PhoneLimitResult =
  | { ok: true }
  | { ok: false; reason: PhoneReason }

export type IpLimitResult = { ok: true } | { ok: false; reason: IpReason }

const HOUR_MS = 3600_000

function envInt(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function thresholds() {
  return {
    phoneCooldownMs: envInt("SMS_RATE_PHONE_COOLDOWN_SECONDS", 60) * 1000,
    phoneHourly: envInt("SMS_RATE_PHONE_HOURLY", 5),
    ipHourly: envInt("SMS_RATE_IP_HOURLY", 10),
  }
}

class RateLimiter {
  private phoneBuckets = new Map<string, Bucket>()
  private ipBuckets = new Map<string, Bucket>()

  /**
   * 检查并消费一次手机号配额。
   * 调用即视为尝试发送，成功时会计入冷却与小时计数。
   */
  checkAndConsumePhone(phone: string): PhoneLimitResult {
    const t = thresholds()
    const now = Date.now()
    const key = `phone:${phone}`
    const bucket = this.phoneBuckets.get(key)

    if (bucket) {
      // 冷却期内
      if (now < bucket.nextAllowedAt) {
        return { ok: false, reason: "cooldown" }
      }
      // 小时窗口未过期且已达上限
      const hourElapsed = now - bucket.firstAt >= HOUR_MS
      if (!hourElapsed && bucket.count >= t.phoneHourly) {
        return { ok: false, reason: "hourly" }
      }
      // 消费一次：窗口过期则重置
      if (hourElapsed) {
        bucket.count = 1
        bucket.firstAt = now
      } else {
        bucket.count += 1
      }
      bucket.nextAllowedAt = now + t.phoneCooldownMs
      return { ok: true }
    }

    // 新建 bucket
    this.phoneBuckets.set(key, {
      count: 1,
      firstAt: now,
      nextAllowedAt: now + t.phoneCooldownMs,
    })
    return { ok: true }
  }

  /**
   * 检查并消费一次 IP 配额。仅小时窗口限制。
   */
  checkAndConsumeIp(ip: string): IpLimitResult {
    const t = thresholds()
    const now = Date.now()
    const key = `ip:${ip}`
    const bucket = this.ipBuckets.get(key)

    if (bucket) {
      const hourElapsed = now - bucket.firstAt >= HOUR_MS
      if (!hourElapsed && bucket.count >= t.ipHourly) {
        return { ok: false, reason: "hourly" }
      }
      if (hourElapsed) {
        bucket.count = 1
        bucket.firstAt = now
      } else {
        bucket.count += 1
      }
      return { ok: true }
    }

    this.ipBuckets.set(key, {
      count: 1,
      firstAt: now,
      nextAllowedAt: 0,
    })
    return { ok: true }
  }

  /**
   * 验证成功后清除手机号的限流状态（便于下一次会话立即请求新验证码）。
   */
  resetPhone(phone: string): void {
    this.phoneBuckets.delete(`phone:${phone}`)
  }

  /**
   * 仅供测试使用：重置所有内部状态。
   */
  __resetForTest(): void {
    this.phoneBuckets.clear()
    this.ipBuckets.clear()
  }
}

export const rateLimiter = new RateLimiter()
