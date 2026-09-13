/**
 * 测试辅助:提取 drizzle 条件对象(如 `eq()` / `and()` 的结果)中绑定的参数值。
 *
 * 路由集成测试统一 mock `@/lib/db` 链,不真正执行 SQL,因此无法直接断言 where 条件。
 * 这里遍历 SQL 对象内部的 `queryChunks`,把 Param 上绑定的标量值收集出来,
 * 用于验证「按 userId / creatorId 过滤」这类参数是否正确拼装(仅测试使用)。
 */
export function extractSqlParamValues(condition: unknown): unknown[] {
  const values: unknown[] = []
  collect(condition, values)
  if (values.length === 0) {
    // drizzle 内部结构变化时显式失败,避免 not.toContain 之类的断言静默通过
    throw new Error(
      "extractSqlParamValues: 未能解析出绑定参数, drizzle 内部结构可能已变化"
    )
  }
  return values
}

function collect(node: unknown, out: unknown[]): void {
  if (node === null || typeof node !== "object") return

  const chunks = (node as { queryChunks?: unknown[] }).queryChunks
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) collect(chunk, out)
    return
  }

  // Param 节点持有绑定值;StringChunk 的 value 为字符串数组,这里只收集标量
  const value = (node as { value?: unknown }).value
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    out.push(value)
  }
}
