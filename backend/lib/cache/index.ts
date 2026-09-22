import { logger, LOG_PREFIX } from "@/lib/logger"

import { readCacheConfig } from "./config"
import { MemoryCacheStore } from "./memory-store"
import { createRedisCacheStore } from "./redis-store"
import type { CacheStore } from "./types"
import { errorMessage } from "./utils"

export { CACHE_TTL, DEFAULT_CACHE_KEY_PREFIX, readCacheConfig } from "./config"
export { CACHE_NAMESPACE, cacheKeys, encodeKeySegment } from "./keys"
export type { CacheConfig, CacheDriver, CacheStore } from "./types"

declare global {
  var __cacheStoreInit__: Promise<CacheStore> | undefined
}

/** 模块级单例:Redis 驱动需要动态 import 适配器,因此缓存初始化是异步的 */
let storePromise: Promise<CacheStore> | null = null

/**
 * 获取缓存单例(异步)。
 * 非生产环境用 globalThis 兜住 HMR 期间的重复初始化,对齐 `lib/db.ts` 的既有写法。
 */
export function getCacheStore(): Promise<CacheStore> {
  if (storePromise) return storePromise
  if (process.env.NODE_ENV !== "production" && globalThis.__cacheStoreInit__) {
    storePromise = globalThis.__cacheStoreInit__
    return storePromise
  }
  const init = initCacheStore()
  storePromise = init
  if (process.env.NODE_ENV !== "production") globalThis.__cacheStoreInit__ = init
  return init
}

/**
 * 按配置创建缓存驱动:
 * - `memory`(默认)→ 进程内内存;
 * - `redis` → `@keyv/redis`;未配置 `REDIS_URL` 或加载失败时告警并回退内存,业务无感。
 */
async function initCacheStore(): Promise<CacheStore> {
  const config = readCacheConfig()
  if (config.invalidDriver) {
    logger.warn(LOG_PREFIX.CACHE, "Unknown CACHE_DRIVER, fallback to auto detection", {
      value: config.invalidDriver,
    })
  }

  if (config.driver === "redis") {
    if (!config.redisUrl) {
      logger.warn(
        LOG_PREFIX.CACHE,
        "CACHE_DRIVER=redis but REDIS_URL is missing, fallback to memory driver"
      )
    } else {
      try {
        const store = await createRedisCacheStore(config.redisUrl, config.keyPrefix)
        logger.info(LOG_PREFIX.CACHE, "Cache store initialized", { driver: store.driver })
        return store
      } catch (err) {
        logger.warn(LOG_PREFIX.CACHE, "Redis cache store init failed, fallback to memory driver", {
          error: errorMessage(err),
        })
      }
    }
  }

  const store = new MemoryCacheStore(config.keyPrefix)
  logger.info(LOG_PREFIX.CACHE, "Cache store initialized", { driver: store.driver })
  return store
}

/** 测试钩子:重置缓存单例(仅测试使用) */
export function __resetCacheForTest(): void {
  storePromise = null
  globalThis.__cacheStoreInit__ = undefined
}

/**
 * 读缓存:任何异常都降级为「未命中」(返回 undefined),由调用方回源。
 */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const store = await getCacheStore()
    return await store.get<T>(key)
  } catch (err) {
    logger.warn(LOG_PREFIX.CACHE, "Cache get failed, treat as miss", {
      key,
      error: errorMessage(err),
    })
    return undefined
  }
}

/** 写缓存:失败仅告警,不影响业务结果 */
export async function cacheSet<T>(key: string, value: T, ttlMs?: number): Promise<void> {
  try {
    const store = await getCacheStore()
    await store.set(key, value, ttlMs)
  } catch (err) {
    logger.warn(LOG_PREFIX.CACHE, "Cache set failed", { key, error: errorMessage(err) })
  }
}

/** 删除缓存(失效):失败仅告警,过期前可能读到旧值 */
export async function cacheDel(key: string): Promise<void> {
  try {
    const store = await getCacheStore()
    await store.del(key)
  } catch (err) {
    logger.warn(LOG_PREFIX.CACHE, "Cache del failed", { key, error: errorMessage(err) })
  }
}

/** 批量删除缓存(失效) */
export async function cacheMdel(keys: string[]): Promise<void> {
  try {
    const store = await getCacheStore()
    await store.mdel(keys)
  } catch (err) {
    logger.warn(LOG_PREFIX.CACHE, "Cache mdel failed", { keys, error: errorMessage(err) })
  }
}

/**
 * 函数结果缓存(fail-open):
 * - store 层已保证读写缓存异常降级,这里只额外兜住「缓存初始化失败」;
 * - loader 自身的异常原样抛出,不会被吞掉或重复执行。
 */
export async function cacheWrap<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  let store: CacheStore
  try {
    store = await getCacheStore()
  } catch (err) {
    logger.warn(LOG_PREFIX.CACHE, "Cache store unavailable, load from source", {
      key,
      error: errorMessage(err),
    })
    return loader()
  }
  return store.wrap(key, loader, ttlMs)
}
