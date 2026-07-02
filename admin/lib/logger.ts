/**
 * 极简结构化日志工具。
 * - 不引入第三方依赖，基于 console 包装
 * - 统一带前缀与可选 context 对象，便于未来替换为 pino/winston
 * - 生产环境使用 JSON 友好的字符串化，避免堆叠多个 console 参数丢失上下文
 */
type LogLevel = "info" | "warn" | "error"

function emit(
  level: LogLevel,
  prefix: string,
  message: string,
  context?: Record<string, unknown>
) {
  const ts = new Date().toISOString()
  const ctxStr = context ? " " + JSON.stringify(context) : ""
  const line = `[${ts}] [${prefix}] ${message}${ctxStr}`
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.info(line)
}

export const logger = {
  info: (prefix: string, message: string, context?: Record<string, unknown>) =>
    emit("info", prefix, message, context),
  warn: (prefix: string, message: string, context?: Record<string, unknown>) =>
    emit("warn", prefix, message, context),
  error: (prefix: string, message: string, context?: Record<string, unknown>) =>
    emit("error", prefix, message, context),
}

/** 推荐使用的统一前缀常量，避免散落字符串字面量。 */
export const LOG_PREFIX = {
  AUTH: "AUTH",
  SMS: "SMS",
  ACCOUNT: "ACCOUNT",
  WECHAT: "WECHAT",
} as const
