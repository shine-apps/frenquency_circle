/** 缓存层内部通用小工具。 */

/** 规范化 TTL:非正数 / 非有限值视为「不过期」,返回 undefined */
export function normalizeTtl(ttlMs: number | undefined): number | undefined {
  if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return undefined
  }
  return Math.floor(ttlMs)
}

/** 统一的错误文案提取(日志用,避免各处重复 instanceof 判断) */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
