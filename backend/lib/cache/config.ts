import type { CacheConfig, CacheDriver } from "./types"

/** 默认 key 前缀:多应用/多环境共用同一 Redis 时用于隔离 */
export const DEFAULT_CACHE_KEY_PREFIX = "qlq"

/**
 * 各业务命名空间的默认 TTL(毫秒),集中定义便于统一调整:
 * - 分类树:低频变动(运营维护),可接受较长陈旧窗口;
 * - 标签搜索:高频只读,短窗口自然过期;
 * - 系统设置:管理员改动需较快生效。
 */
export const CACHE_TTL = {
  CATEGORY_TREE: 10 * 60 * 1000,
  TAG_SEARCH: 60 * 1000,
  SETTINGS: 60 * 1000,
} as const

/** 规范化 key 前缀:去掉首尾空白与尾部冒号,空值回退默认前缀 */
function normalizeKeyPrefix(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/:+$/, "")
  return trimmed || DEFAULT_CACHE_KEY_PREFIX
}

function normalizeDriver(raw: string): CacheDriver | null {
  if (raw === "memory" || raw === "redis") return raw
  return null
}

/**
 * 读取缓存配置:
 * - `CACHE_DRIVER` 显式指定 `memory` / `redis` 时优先;
 * - 未指定时按 `REDIS_URL` 自动推断(有则 redis,否则 memory);
 * - 非法 `CACHE_DRIVER` 记录在 `invalidDriver`,由初始化阶段告警并回退自动推断。
 */
export function readCacheConfig(env: NodeJS.ProcessEnv = process.env): CacheConfig {
  const rawDriver = (env.CACHE_DRIVER ?? "").trim().toLowerCase()
  const driver = normalizeDriver(rawDriver)
  const redisUrl = (env.REDIS_URL ?? "").trim()
  return {
    driver: driver ?? (redisUrl ? "redis" : "memory"),
    keyPrefix: normalizeKeyPrefix(env.CACHE_KEY_PREFIX),
    redisUrl: redisUrl || undefined,
    invalidDriver: !driver && rawDriver ? rawDriver : undefined,
  }
}
