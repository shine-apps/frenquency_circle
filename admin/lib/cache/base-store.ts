import type { Cache } from "cache-manager"

import type { CacheDriver, CacheStore } from "./types"

/**
 * 驱动无关的公共实现:普通读写 + fail-open 的 `wrap`。
 *
 * 子类只需提供底层 `Cache`(cache-manager 实例)、driver 标识,
 * 以及原子原语(`incr` / `setIfAbsent`)与连接释放。
 */
export abstract class BaseCacheStore implements CacheStore {
  abstract readonly driver: CacheDriver

  /** 同键并发合并表:同一 key 上只允许一个 loader 在执行(防缓存击穿) */
  private readonly inFlight = new Map<string, Promise<unknown>>()

  protected constructor(
    private readonly cache: Cache,
    private readonly keyPrefix: string
  ) {}

  /** 补齐统一前缀:业务层传逻辑 key,存储层负责前缀 */
  protected key(key: string): string {
    return `${this.keyPrefix}:${key}`
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.cache.get<T>(this.key(key))
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.cache.set(this.key(key), value, ttlMs)
  }

  async del(key: string): Promise<void> {
    await this.cache.del(this.key(key))
  }

  async mdel(keys: string[]): Promise<void> {
    await this.cache.mdel(keys.map((key) => this.key(key)))
  }

  async clear(): Promise<void> {
    await this.cache.clear()
  }

  /**
   * 函数结果缓存:
   * - 读缓存异常 → 视为未命中,继续回源(fail-open);
   * - loader 异常 → 原样抛出,不吞错也不重试;
   * - 写缓存异常 → 忽略,直接返回回源结果。
   */
  async wrap<T>(key: string, loader: () => Promise<T>, ttlMs?: number): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined
    if (existing) return existing

    const task = (async () => {
      let cached: T | undefined
      try {
        cached = await this.get<T>(key)
      } catch {
        cached = undefined
      }
      if (cached !== undefined) return cached

      const value = await loader()
      // loader 返回 undefined 时不回写:Keyv 写入 undefined 后 get 仍返回 undefined,
      // 既不会被命中还会反复回写;调用方若要缓存「缺失」语义请用 null 显式表达
      if (value === undefined) return value
      try {
        await this.set(key, value, ttlMs)
      } catch {
        // 回写失败不影响本次结果
      }
      return value
    })()

    this.inFlight.set(key, task)
    try {
      return await task
    } finally {
      this.inFlight.delete(key)
    }
  }

  abstract incr(key: string, ttlMs?: number): Promise<number>
  abstract setIfAbsent(key: string, ttlMs: number): Promise<boolean>

  async disconnect(): Promise<void> {
    await this.cache.disconnect()
  }
}
