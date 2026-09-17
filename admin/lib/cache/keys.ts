/**
 * 缓存 key 唯一约定:业务接入与失效两侧共用,避免散落字符串字面量。
 *
 * 这里只定义**逻辑 key**(命名空间 + 参数),统一前缀由缓存实现内部补齐,
 * 因此业务代码与测试都不需要感知前缀配置。
 */

/** 缓存命名空间常量 */
export const CACHE_NAMESPACE = {
  /** 分类树(categories 表,管理端与 SSR 读取) */
  CATEGORY_TREE: "category:tree",
  /** 公开分类树(categories + approved 标签组装结果) */
  CATEGORY_PUBLIC: "category:public",
  /** 标签搜索结果(query + limit 维度) */
  TAG_SEARCH: "tagsearch",
  /** 系统设置全量列表 */
  SETTINGS_ALL: "settings:all",
  /** 系统设置单项 */
  SETTINGS_ITEM: "settings:item",
  /** 微信小程序 access_token */
  WECHAT_MP_TOKEN: "wechat:mp:token",
  /** 微信公众号 jsapi_ticket */
  WECHAT_OA_TICKET: "wechat:oa:ticket",
  /** 短信限流计数(原子原语) */
  RATE_LIMIT: "ratelimit",
} as const

/**
 * 转义 key 参数段:URI 编码避免用户输入中的 `:` / 空白等破坏 key 结构。
 * 注意:仅用于拼装 key,不影响业务参数本身。
 */
export function encodeKeySegment(raw: string): string {
  return encodeURIComponent(raw)
}

/** 业务 key 构造器(唯一入口,写入与失效共用同一份约定) */
export const cacheKeys = {
  categoryTree: (): string => CACHE_NAMESPACE.CATEGORY_TREE,
  categoryPublic: (): string => CACHE_NAMESPACE.CATEGORY_PUBLIC,
  tagSearch: (query: string, limit: number): string =>
    `${CACHE_NAMESPACE.TAG_SEARCH}:${encodeKeySegment(query)}:${limit}`,
  settingsAll: (): string => CACHE_NAMESPACE.SETTINGS_ALL,
  settingsItem: (settingKey: string): string =>
    `${CACHE_NAMESPACE.SETTINGS_ITEM}:${encodeKeySegment(settingKey)}`,
  wechatMpToken: (appId: string): string =>
    `${CACHE_NAMESPACE.WECHAT_MP_TOKEN}:${encodeKeySegment(appId)}`,
  wechatOaTicket: (appId: string): string =>
    `${CACHE_NAMESPACE.WECHAT_OA_TICKET}:${encodeKeySegment(appId)}`,
  rateLimit: (...segments: Array<string | number>): string =>
    [CACHE_NAMESPACE.RATE_LIMIT, ...segments.map(String)].join(":"),
} as const
