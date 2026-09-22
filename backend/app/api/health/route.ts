import { ok } from "@/lib/api"

/**
 * GET /api/health
 *
 * 健康检查端点(无需鉴权)。
 * 供 Docker HEALTHCHECK、CI 验证、负载均衡探针使用。
 * 返回 200 表示进程存活且 Next.js 路由正常响应。
 */
export function GET() {
  return ok({ status: "ok" })
}
