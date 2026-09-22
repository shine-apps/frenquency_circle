import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createCache } from "cache-manager"

import { CACHE_TTL, DEFAULT_CACHE_KEY_PREFIX, readCacheConfig } from "@/lib/cache/config"
import { __resetCacheForTest, cacheWrap, getCacheStore } from "@/lib/cache/index"
import { cacheKeys, encodeKeySegment } from "@/lib/cache/keys"
import { MemoryCacheStore } from "@/lib/cache/memory-store"
import { RedisCacheStore } from "@/lib/cache/redis-store"

/** 构造只关心缓存相关字段的 env 对象(ProcessEnv 的类型要求过严,这里只做结构适配) */
function cacheEnv(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv
}

describe("lib/cache/config", () => {
  it("defaults to memory driver when nothing is configured", () => {
    const config = readCacheConfig(cacheEnv({}))
    expect(config.driver).toBe("memory")
    expect(config.keyPrefix).toBe(DEFAULT_CACHE_KEY_PREFIX)
    expect(config.redisUrl).toBeUndefined()
  })

  it("honors explicit CACHE_DRIVER", () => {
    expect(readCacheConfig(cacheEnv({ CACHE_DRIVER: "redis", REDIS_URL: "redis://x" })).driver).toBe("redis")
    expect(readCacheConfig(cacheEnv({ CACHE_DRIVER: "MEMORY ", REDIS_URL: "redis://x" })).driver).toBe("memory")
  })

  it("infers redis from REDIS_URL when CACHE_DRIVER is unset", () => {
    const config = readCacheConfig(cacheEnv({ REDIS_URL: "redis://localhost:6379" }))
    expect(config.driver).toBe("redis")
    expect(config.redisUrl).toBe("redis://localhost:6379")
  })

  it("exposes invalid CACHE_DRIVER and falls back to auto detection", () => {
    const config = readCacheConfig(cacheEnv({ CACHE_DRIVER: "memcached" }))
    expect(config.invalidDriver).toBe("memcached")
    expect(config.driver).toBe("memory")
  })

  it("normalizes key prefix (trims trailing colon, falls back to default)", () => {
    expect(readCacheConfig(cacheEnv({ CACHE_KEY_PREFIX: " app: " })).keyPrefix).toBe("app")
    expect(readCacheConfig(cacheEnv({ CACHE_KEY_PREFIX: "  " })).keyPrefix).toBe(DEFAULT_CACHE_KEY_PREFIX)
  })
})

describe("lib/cache/keys", () => {
  it("builds stable logical keys", () => {
    expect(cacheKeys.categoryTree()).toBe("category:tree")
    expect(cacheKeys.categoryPublic()).toBe("category:public")
    expect(cacheKeys.settingsAll()).toBe("settings:all")
    expect(cacheKeys.settingsItem("contentModerationEnabled")).toBe(
      "settings:item:contentModerationEnabled"
    )
    expect(cacheKeys.wechatMpToken("wx-1")).toBe("wechat:mp:token:wx-1")
    expect(cacheKeys.rateLimit("phone", "13800138000")).toBe("ratelimit:phone:13800138000")
  })

  it("escapes user input segments to avoid key structure collisions", () => {
    const colon = cacheKeys.tagSearch("a:b", 10)
    const plain = cacheKeys.tagSearch("a", 10)
    expect(colon).not.toBe(plain)
    expect(colon).toContain(encodeKeySegment("a:b"))
    expect(cacheKeys.tagSearch("太极", 10)).toBe("tagsearch:%E5%A4%AA%E6%9E%81:10")
  })

  it("exposes sensible default TTLs", () => {
    expect(CACHE_TTL.CATEGORY_TREE).toBeGreaterThan(CACHE_TTL.TAG_SEARCH)
    expect(CACHE_TTL.SETTINGS).toBeGreaterThan(0)
  })
})

describe("lib/cache memory driver", () => {
  let store: MemoryCacheStore

  beforeEach(() => {
    store = new MemoryCacheStore("test")
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe("get / set / del", () => {
    it("returns undefined on miss and round-trips values", async () => {
      expect(await store.get("k")).toBeUndefined()
      await store.set("k", { a: 1 })
      expect(await store.get<{ a: number }>("k")).toEqual({ a: 1 })
    })

    it("expires entries by ttl", async () => {
      await store.set("k", "v", 60_000)
      expect(await store.get("k")).toBe("v")
      vi.setSystemTime(new Date("2026-01-01T00:01:01Z"))
      expect(await store.get("k")).toBeUndefined()
    })

    it("deletes single and multiple keys", async () => {
      await store.set("a", 1)
      await store.set("b", 2)
      await store.del("a")
      expect(await store.get("a")).toBeUndefined()
      expect(await store.get("b")).toBe(2)
      await store.mdel(["b"])
      expect(await store.get("b")).toBeUndefined()
    })

    it("isolates keys by store prefix", async () => {
      const other = new MemoryCacheStore("other")
      await store.set("k", "v1")
      expect(await other.get("k")).toBeUndefined()
      await other.set("k", "v2")
      expect(await store.get("k")).toBe("v1")
      expect(await other.get("k")).toBe("v2")
    })
  })

  describe("wrap", () => {
    it("loads once then serves from cache", async () => {
      const loader = vi.fn(async () => ({ hit: 1 }))
      const first = await store.wrap("w", loader, 60_000)
      const second = await store.wrap("w", loader, 60_000)
      expect(first).toEqual({ hit: 1 })
      expect(second).toEqual({ hit: 1 })
      expect(loader).toHaveBeenCalledTimes(1)
    })

    it("merges concurrent loaders for the same key", async () => {
      const loader = vi.fn(
        async () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve("value"), 10)
          })
      )
      const task1 = store.wrap("w", loader, 60_000)
      const task2 = store.wrap("w", loader, 60_000)
      await vi.advanceTimersByTimeAsync(20)
      await expect(task1).resolves.toBe("value")
      await expect(task2).resolves.toBe("value")
      expect(loader).toHaveBeenCalledTimes(1)
    })

    it("propagates loader errors without caching them", async () => {
      const loader = vi.fn(async () => {
        throw new Error("db down")
      })
      await expect(store.wrap("w", loader, 60_000)).rejects.toThrow("db down")
      await expect(store.wrap("w", loader, 60_000)).rejects.toThrow("db down")
      expect(loader).toHaveBeenCalledTimes(2)
    })

    it("does not write when the loader returns undefined", async () => {
      const setSpy = vi.spyOn(store, "set")
      const loader = vi.fn(async () => undefined)

      await expect(store.wrap("w", loader, 60_000)).resolves.toBeUndefined()
      expect(setSpy).not.toHaveBeenCalled()

      // 未命中再次回源(不缓存 undefined)
      await store.wrap("w", loader, 60_000)
      expect(loader).toHaveBeenCalledTimes(2)
    })

    it("stays fail-open when the cache read or write throws", async () => {
      vi.spyOn(store, "get").mockRejectedValueOnce(new Error("read failed"))
      const loader = vi.fn(async () => "fresh")
      await expect(store.wrap("w", loader, 60_000)).resolves.toBe("fresh")

      vi.spyOn(store, "set").mockRejectedValueOnce(new Error("write failed"))
      await expect(store.wrap("w2", loader, 60_000)).resolves.toBe("fresh")
    })
  })

  describe("incr", () => {
    it("counts from 1 and accumulates within the window", async () => {
      expect(await store.incr("c", 60_000)).toBe(1)
      expect(await store.incr("c", 60_000)).toBe(2)
      expect(await store.incr("c", 60_000)).toBe(3)
    })

    it("resets after the window expires (ttl only set on creation)", async () => {
      await store.incr("c", 60_000)
      await store.incr("c", 60_000)
      vi.setSystemTime(new Date("2026-01-01T00:01:01Z"))
      expect(await store.incr("c", 60_000)).toBe(1)
    })

    it("isolates keys and supports deletion", async () => {
      await store.incr("a", 60_000)
      expect(await store.incr("b", 60_000)).toBe(1)
      await store.del("a")
      expect(await store.incr("a", 60_000)).toBe(1)
    })

    it("merges concurrent increments", async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => store.incr("c", 60_000))
      )
      expect([...results].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
  })

  describe("setIfAbsent", () => {
    it("writes only when absent and expires with ttl", async () => {
      expect(await store.setIfAbsent("lock", 60_000)).toBe(true)
      expect(await store.setIfAbsent("lock", 60_000)).toBe(false)
      vi.setSystemTime(new Date("2026-01-01T00:01:01Z"))
      expect(await store.setIfAbsent("lock", 60_000)).toBe(true)
    })

    it("can be cleared via del / mdel", async () => {
      await store.setIfAbsent("lock", 60_000)
      await store.mdel(["lock"])
      expect(await store.setIfAbsent("lock", 60_000)).toBe(true)
    })

    it("rejects a non-positive ttl instead of creating a lock that never expires", async () => {
      await expect(store.setIfAbsent("lock", 0)).rejects.toThrow("positive ttl")
      await expect(store.setIfAbsent("lock", -1)).rejects.toThrow("positive ttl")
    })
  })
})

describe("lib/cache redis driver degradation", () => {
  /** 注入一个永远连不上的适配器,验证原子原语的快速失败与降级窗口 */
  function createFailingRedisStore(): RedisCacheStore {
    const adapter = {
      getClient: () => Promise.reject(new Error("connect ECONNREFUSED")),
    }
    return new RedisCacheStore(createCache(), "test", adapter)
  }

  it("fails fast within the degrade window after the first failure", async () => {
    const store = createFailingRedisStore()

    await expect(store.incr("k", 60_000)).rejects.toThrow("connect ECONNREFUSED")

    const started = Date.now()
    await expect(store.incr("k", 60_000)).rejects.toThrow("temporarily degraded")
    await expect(store.setIfAbsent("k", 60_000)).rejects.toThrow("temporarily degraded")
    expect(Date.now() - started).toBeLessThan(50)
  })

  it("rejects a non-positive ttl before touching the network", async () => {
    const store = createFailingRedisStore()
    await expect(store.setIfAbsent("k", 0)).rejects.toThrow("positive ttl")
  })

  it("still attempts invalidation inside the degrade window", async () => {
    const store = createFailingRedisStore()
    // 先失败一次进入降级窗口
    await expect(store.incr("k", 60_000)).rejects.toThrow("connect ECONNREFUSED")

    // 失效操作不做短路:仍然执行(此处底层为内存 store,故可成功)
    await expect(store.del("k")).resolves.toBeUndefined()
    await expect(store.mdel(["k"])).resolves.toBeUndefined()
  })

  it("retries the network after the degrade window expires", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    try {
      const store = createFailingRedisStore()
      await expect(store.incr("k", 60_000)).rejects.toThrow("connect ECONNREFUSED")
      await expect(store.incr("k", 60_000)).rejects.toThrow("temporarily degraded")

      vi.setSystemTime(new Date("2026-01-01T00:00:31Z"))
      await expect(store.incr("k", 60_000)).rejects.toThrow("connect ECONNREFUSED")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("lib/cache entry point", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.CACHE_DRIVER
    delete process.env.REDIS_URL
    __resetCacheForTest()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    __resetCacheForTest()
  })

  it("initializes the memory driver by default and reuses the singleton", async () => {
    const [store1, store2] = await Promise.all([getCacheStore(), getCacheStore()])
    expect(store1).toBe(store2)
    expect(store1.driver).toBe("memory")
  })

  it("falls back to memory when CACHE_DRIVER=redis but REDIS_URL is missing", async () => {
    process.env.CACHE_DRIVER = "redis"
    const store = await getCacheStore()
    expect(store.driver).toBe("memory")
  })

  it("cacheWrap returns loader result and propagates loader errors", async () => {
    await expect(cacheWrap("entry:ok", async () => "value")).resolves.toBe("value")
    await expect(
      cacheWrap("entry:err", async () => {
        throw new Error("loader failed")
      })
    ).rejects.toThrow("loader failed")
  })
})
