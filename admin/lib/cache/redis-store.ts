import { createCache, type Cache } from "cache-manager"

import { logger, LOG_PREFIX } from "@/lib/logger"

import { BaseCacheStore } from "./base-store"
import { errorMessage, normalizeTtl } from "./utils"

/** 底层 Redis 客户端最小能力面(只需要 Lua eval,避免耦合 @redis/client 版本) */
type RedisRawClient = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>
}

/** `@keyv/redis` 适配器最小能力面 */
type RedisAdapter = {
  getClient(): Promise<RedisRawClient>
}

/** Redis 建连超时:失败要快,避免请求被重试拖慢(由上层 fail-open 回源兜底) */
const REDIS_CONNECTION_TIMEOUT_MS = 3_000

/** 失败后的降级窗口:窗口内直接跳过 Redis(不发起网络请求),到期后自动尝试恢复 */
const DEGRADE_WINDOW_MS = 30_000

/** INCR + 首次创建时设置 PEXPIRE(不因自增重置窗口) */
const INCR_WITH_TTL_LUA = `
local value = redis.call('INCR', KEYS[1])
if value == 1 and tonumber(ARGV[1]) > 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return value
`

/** SET NX + PX:返回 1 表示写入成功,0 表示 key 已存在(TTL 由调用方保证为正) */
const SET_IF_ABSENT_LUA = `
if redis.call('SET', KEYS[1], '1', 'PX', ARGV[1], 'NX') then return 1 end
return 0
`

/**
 * Redis 驱动:普通 key/value 由 cache-manager + `@keyv/redis` 承担,
 * 原子原语用 Lua 脚本保证跨实例原子(限流多实例一致的关键)。
 *
 * 原子原语直接以「前缀 + 逻辑 key」落库,与 cache-manager 写入的 key 完全一致;
 * 但两者的值空间不同:原子原语写的是纯整数字符串,不要用 `get` 读取。
 *
 * 容错:Redis 异常时抛错给上层(fail-open 回源),同时开启 {@link DEGRADE_WINDOW_MS}
 * 降级窗口,窗口内读/写直接跳过网络,避免故障期间每个请求都等待重试;
 * 失效类操作(`del` / `mdel` / `clear`)不做短路 —— 失效被跳过就永久丢失。
 */
export class RedisCacheStore extends BaseCacheStore {
  readonly driver = "redis" as const

  private clientPromise: Promise<RedisRawClient> | null = null
  /** 降级截止时间戳(毫秒);0 表示正常 */
  private degradeUntil = 0

  constructor(cache: Cache, keyPrefix: string, private readonly adapter: RedisAdapter) {
    super(cache, keyPrefix)
  }

  override async get<T>(key: string): Promise<T | undefined> {
    return this.run(() => super.get<T>(key))
  }

  override async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    return this.run(() => super.set(key, value, ttlMs))
  }

  override async del(key: string): Promise<void> {
    return this.run(() => super.del(key), { skipDegrade: true })
  }

  override async mdel(keys: string[]): Promise<void> {
    return this.run(() => super.mdel(keys), { skipDegrade: true })
  }

  override async clear(): Promise<void> {
    return this.run(() => super.clear(), { skipDegrade: true })
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    return this.run(async () => {
      const client = await this.getClient()
      const ttl = normalizeTtl(ttlMs) ?? 0
      const result = await client.eval(INCR_WITH_TTL_LUA, {
        keys: [this.key(key)],
        arguments: [String(ttl)],
      })
      const value = Number(result)
      if (!Number.isFinite(value)) {
        throw new Error(`redis INCR returned non-numeric result: ${String(result)}`)
      }
      return value
    })
  }

  async setIfAbsent(key: string, ttlMs: number): Promise<boolean> {
    const ttl = normalizeTtl(ttlMs)
    // 占位锁必须有明确过期时间:误传 0 / 负数会让 key 永不过期(永久死锁)
    if (!ttl) {
      throw new Error(`setIfAbsent requires a positive ttl, got: ${String(ttlMs)}`)
    }
    return this.run(async () => {
      const client = await this.getClient()
      const result = await client.eval(SET_IF_ABSENT_LUA, {
        keys: [this.key(key)],
        arguments: [String(ttl)],
      })
      return Number(result) === 1
    })
  }

  override async disconnect(): Promise<void> {
    this.clientPromise = null
    this.degradeUntil = 0
    await super.disconnect()
  }

  /**
   * 统一执行包装:
   * - 降级窗口内直接抛错(不发起网络请求),由上层 fail-open 回源;
   * - `skipDegrade` 供失效类操作使用:失效被跳过即永久丢失,宁可多等一次连接超时,
   *   也不要让写后的旧数据留到 TTL 过期;
   * - 任意操作失败即开启/延长降级窗口;成功后立即恢复。
   */
  private async run<T>(op: () => Promise<T>, options?: { skipDegrade?: boolean }): Promise<T> {
    if (!options?.skipDegrade && Date.now() < this.degradeUntil) {
      throw new Error("redis cache store is temporarily degraded")
    }
    try {
      const result = await op()
      this.degradeUntil = 0
      return result
    } catch (err) {
      this.degradeUntil = Date.now() + DEGRADE_WINDOW_MS
      throw err
    }
  }

  /**
   * 惰性建连:首次使用时才真正连接 Redis;
   * 失败后重置 promise,下次调用(降级窗口结束后)可重试。
   */
  private getClient(): Promise<RedisRawClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.adapter.getClient().catch((err: unknown) => {
        this.clientPromise = null
        throw err
      })
    }
    return this.clientPromise
  }
}

/**
 * 创建 Redis 驱动(惰性连接,构造时不发起网络请求)。
 *
 * `@keyv/redis` 通过动态 import 加载:未安装 / 加载失败时由 `index.ts` 回退内存驱动。
 * `createKeyv` 内部 `useKeyPrefix: false`,即 key 原样落库 —— 与 Lua 原子原语的 key 一致。
 *
 * 连接与命令失败都快速抛出(connectionTimeout + throwOnErrors),交给上层降级处理;
 * 适配器错误事件统一在 Keyv 层监听并告警,避免未处理的 error 事件。
 */
export async function createRedisCacheStore(
  redisUrl: string,
  keyPrefix: string
): Promise<RedisCacheStore> {
  const { createKeyv } = await import("@keyv/redis")
  const keyv = createKeyv(redisUrl, {
    connectionTimeout: REDIS_CONNECTION_TIMEOUT_MS,
    throwOnConnectError: true,
    throwOnErrors: true,
  })
  keyv.on("error", (error: unknown) => {
    logger.warn(LOG_PREFIX.CACHE, "Redis cache store error", {
      error: errorMessage(error),
    })
  })
  // `opts.store` 属 Keyv 内部字段:升级后若不再暴露,必须在这里立即失败,
  // 否则会推迟到首个原子原语才暴露,而限流 fail-open 会把它静默吞掉
  const adapter = keyv.opts.store as unknown as Partial<RedisAdapter> | undefined
  if (typeof adapter?.getClient !== "function") {
    throw new Error(
      "@keyv/redis adapter does not expose getClient(); check installed keyv/@keyv/redis version"
    )
  }
  const cache = createCache({ stores: [keyv] })
  return new RedisCacheStore(cache, keyPrefix, adapter as RedisAdapter)
}
