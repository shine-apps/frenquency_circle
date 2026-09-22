/**
 * 缓存抽象层类型定义。
 *
 * 设计目标:业务层只依赖 `CacheStore` 接口,驱动实现(memory / redis)可替换;
 * 新增驱动只需实现该接口并在 `index.ts` 的工厂里注册,不改调用方。
 */

/** 缓存驱动标识:memory = 进程内内存(默认);redis = 跨实例共享 */
export type CacheDriver = "memory" | "redis"

/** 缓存配置(由 `readCacheConfig` 从环境变量读取) */
export type CacheConfig = {
  /** 生效的驱动 */
  driver: CacheDriver
  /** 所有缓存 key 的统一前缀(多应用/多环境共用 Redis 时用于隔离) */
  keyPrefix: string
  /** Redis 连接串(仅 driver=redis 时使用) */
  redisUrl?: string
  /** `CACHE_DRIVER` 的非法原始值(非空时由初始化阶段告警并回退自动推断) */
  invalidDriver?: string
}

/**
 * 缓存抽象:业务层只依赖此接口。
 *
 * 约定:
 * - 传入的 key 为**逻辑 key**(不含统一前缀),前缀由实现内部补齐;
 * - 所有方法都可能抛错,业务侧应通过 `index.ts` 的 helper 调用(内置 fail-open 降级)。
 */
export interface CacheStore {
  /** 当前驱动标识 */
  readonly driver: CacheDriver

  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>
  del(key: string): Promise<void>
  mdel(keys: string[]): Promise<void>
  /** 清空当前驱动的数据(仅测试/运维使用,业务代码不要调用) */
  clear(): Promise<void>

  /**
   * 函数结果缓存(fail-open + 同键并发合并):
   * - 命中直接返回;未命中执行 loader 并回写;
   * - 读/写缓存异常不影响返回值,仅 loader 自身的异常对外抛出。
   */
  wrap<T>(key: string, loader: () => Promise<T>, ttlMs?: number): Promise<T>

  /** 原子自增并返回新值;ttlMs 仅在 key 首次创建时生效(不因自增重置窗口) */
  incr(key: string, ttlMs?: number): Promise<number>

  /**
   * 仅当 key 不存在时写入占位并返回 true;已存在返回 false(冷却锁/互斥场景)。
   * `ttlMs` 必须为正数:占位锁必须有明确过期时间,否则误用会造成永久死锁。
   */
  setIfAbsent(key: string, ttlMs: number): Promise<boolean>

  /** 释放底层连接(memory 为空操作) */
  disconnect(): Promise<void>
}
