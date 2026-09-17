/**
 * 短信验证码限流器(基于统一缓存层的原子原语)。
 *
 * 限制规则(与历史进程内实现保持一致):
 * - 单手机号：60s 冷却 + 每小时最多 N 次（默认 5）
 * - 单 IP：每小时最多 M 次（默认 10）
 *
 * 实现要点:
 * - 冷却窗口 = `setIfAbsent(冷却键, cooldownMs)`,仅首次写入成功才进入冷却;
 * - 小时配额 = `incr(小时键, 1h)`,TTL 仅在首次创建时生效,窗口不因自增重置;
 * - 内存驱动下即进程内原子;切换 Redis 后多实例一致(见 `lib/cache`);
 * - 缓存层异常时 **fail-open**(放行并告警):`sms/send` 的 DB 维度
 *   `isIssueCapped` 仍提供「按手机号」的全局上限兜底,Redis 故障不应阻断短信通道。
 */

import { createHash } from "node:crypto"

import { cacheKeys, getCacheStore } from "@/lib/cache"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { errorMessage } from "@/lib/cache/utils"

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

/** 测试用:记录本模块写入过的 key,便于精确清理(不影响其它缓存) */
const touchedKeys = new Set<string>()

function track(key: string): string {
  touchedKeys.add(key)
  return key
}

/**
 * 限流 key 中的手机号 / IP 做加盐哈希后再落库:
 * 切到 Redis 后 key 会保留最长 1 小时,明文标识会出现在 KEYS / 慢日志 / 监控面板 / 快照中。
 * 盐取自部署必备的 AUTH_SECRET,保证 11 位号码空间不可被暴力反查。
 */
const KEY_SALT = process.env.CACHE_KEY_SALT || process.env.AUTH_SECRET || "qlq-ratelimit"

function hashKeySegment(value: string): string {
  return createHash("sha256").update(`${KEY_SALT}:${value}`).digest("hex").slice(0, 32)
}

const cooldownKey = (phone: string): string =>
  track(cacheKeys.rateLimit("phone", "cooldown", hashKeySegment(phone)))
const phoneHourlyKey = (phone: string): string =>
  track(cacheKeys.rateLimit("phone", "hourly", hashKeySegment(phone)))
const ipHourlyKey = (ip: string): string =>
  track(cacheKeys.rateLimit("ip", "hourly", hashKeySegment(ip)))

class RateLimiter {
  /**
   * 检查并消费一次手机号配额。
   * 调用即视为尝试发送:冷却通过后计入小时计数。
   */
  async checkAndConsumePhone(phone: string): Promise<PhoneLimitResult> {
    const t = thresholds()
    try {
      const store = await getCacheStore()

      // 1) 冷却窗口:仅当不存在时写入,写入失败说明仍在冷却期
      const acquired = await store.setIfAbsent(cooldownKey(phone), t.phoneCooldownMs)
      if (!acquired) {
        return { ok: false, reason: "cooldown" }
      }

      // 2) 小时配额:自增;超限时释放本次冷却,保持「超限不消费冷却」的原有语义
      const count = await store.incr(phoneHourlyKey(phone), HOUR_MS)
      if (count > t.phoneHourly) {
        await store.del(cooldownKey(phone))
        return { ok: false, reason: "hourly" }
      }
      return { ok: true }
    } catch (err) {
      logger.warn(LOG_PREFIX.SMS, "Phone rate limit check failed, fail open", {
        phone,
        error: errorMessage(err),
      })
      return { ok: true }
    }
  }

  /**
   * 检查并消费一次 IP 配额。仅小时窗口限制。
   */
  async checkAndConsumeIp(ip: string): Promise<IpLimitResult> {
    const t = thresholds()
    try {
      const store = await getCacheStore()
      const count = await store.incr(ipHourlyKey(ip), HOUR_MS)
      if (count > t.ipHourly) {
        return { ok: false, reason: "hourly" }
      }
      return { ok: true }
    } catch (err) {
      logger.warn(LOG_PREFIX.SMS, "IP rate limit check failed, fail open", {
        ip,
        error: errorMessage(err),
      })
      return { ok: true }
    }
  }

  /**
   * 验证成功后清除手机号的限流状态(便于下一次会话立即请求新验证码)。
   */
  async resetPhone(phone: string): Promise<void> {
    try {
      const store = await getCacheStore()
      await store.mdel([cooldownKey(phone), phoneHourlyKey(phone)])
    } catch (err) {
      logger.warn(LOG_PREFIX.SMS, "Phone rate limit reset failed", {
        phone,
        error: errorMessage(err),
      })
    }
  }

  /**
   * 仅供测试使用:清空本模块写入的限流 key。
   */
  async __resetForTest(): Promise<void> {
    const keys = [...touchedKeys]
    touchedKeys.clear()
    if (keys.length === 0) return
    const store = await getCacheStore()
    await store.mdel(keys)
  }
}

export const rateLimiter = new RateLimiter()
