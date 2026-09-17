import { createCache } from "cache-manager"

import { BaseCacheStore } from "./base-store"
import { DEFAULT_CACHE_KEY_PREFIX } from "./config"
import { normalizeTtl } from "./utils"

/** 原子原语条目:expiresAt 为绝对毫秒时间戳,`Infinity` 表示不过期 */
type CounterEntry = { count: number; expiresAt: number }

/** 惰性清理阈值:计数器表超过该规模时顺带清理过期条目,避免高基数 key 长期占用内存 */
const COUNTER_SWEEP_THRESHOLD = 5_000

/**
 * 进程内内存驱动(默认):
 * - 普通 key/value 走 cache-manager 默认内存 store(支持 TTL);
 * - `incr` / `setIfAbsent` 使用独立计数器表实现,通过「每 key 串行队列」保证
 *   同一 key 上的读-改-写不交错(Node 单线程,只要不留 await 间隙即为原子)。
 *
 * 注意:内存驱动为进程本地,多实例部署时各实例各自计数/各自缓存;
 * 需要全局一致时把 `CACHE_DRIVER` 切到 redis。
 */
export class MemoryCacheStore extends BaseCacheStore {
  readonly driver = "memory" as const

  private readonly counters = new Map<string, CounterEntry>()
  private readonly queues = new Map<string, Promise<void>>()

  constructor(keyPrefix: string = DEFAULT_CACHE_KEY_PREFIX) {
    super(createCache(), keyPrefix)
  }

  override async del(key: string): Promise<void> {
    this.counters.delete(this.key(key))
    await super.del(key)
  }

  override async mdel(keys: string[]): Promise<void> {
    for (const key of keys) this.counters.delete(this.key(key))
    await super.mdel(keys)
  }

  override async clear(): Promise<void> {
    this.counters.clear()
    this.queues.clear()
    await super.clear()
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    return this.withLock(key, () => {
      const resolved = this.key(key)
      const now = Date.now()
      const entry = this.counters.get(resolved)
      if (!entry || entry.expiresAt <= now) {
        const ttl = normalizeTtl(ttlMs)
        this.counters.set(resolved, {
          count: 1,
          expiresAt: ttl ? now + ttl : Number.POSITIVE_INFINITY,
        })
        this.sweepExpired(now)
        return 1
      }
      entry.count += 1
      return entry.count
    })
  }

  async setIfAbsent(key: string, ttlMs: number): Promise<boolean> {
    const ttl = normalizeTtl(ttlMs)
    // 占位锁必须有明确过期时间:误传 0 / 负数会让 key 永不过期(永久死锁)
    if (!ttl) {
      throw new Error(`setIfAbsent requires a positive ttl, got: ${String(ttlMs)}`)
    }
    return this.withLock(key, () => {
      const resolved = this.key(key)
      const now = Date.now()
      if ((this.counters.get(resolved)?.expiresAt ?? 0) > now) return false
      this.counters.set(resolved, { count: 1, expiresAt: now + ttl })
      this.sweepExpired(now)
      return true
    })
  }

  override async disconnect(): Promise<void> {
    // 内存驱动无连接需要释放;清空串行队列避免残留引用
    this.queues.clear()
  }

  /** 每 key 串行执行:保证同一 key 上的读-改-写不交错 */
  private withLock<T>(key: string, task: () => T): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const run = previous.then(task, task)
    const tail = run.then(
      () => undefined,
      () => undefined
    )
    this.queues.set(key, tail)
    void tail.then(() => {
      // 队列已排空时及时回收,避免高基数 key 把 Map 撑大
      if (this.queues.get(key) === tail) this.queues.delete(key)
    })
    return run
  }

  /** 超过阈值时顺带清理已过期条目(惰性清理,避免定时器在 HMR 下泄漏) */
  private sweepExpired(now: number): void {
    if (this.counters.size < COUNTER_SWEEP_THRESHOLD) return
    for (const [key, entry] of this.counters) {
      if (entry.expiresAt <= now) this.counters.delete(key)
    }
  }
}
