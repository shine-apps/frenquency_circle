import { NextResponse } from "next/server"
import { z } from "zod"
import type { IResponse } from "@/types/api"

export function ok<T>(data: T, init?: ResponseInit) {
  const code = init?.status ?? 200
  const body: IResponse<T> = { code, data, message: "OK" }
  return NextResponse.json(body, init)
}

export function fail(
  status: number,
  message: string,
  details?: unknown,
  init?: ResponseInit
) {
  const body: IResponse<null> = { code: status, data: null, message, details }
  return NextResponse.json(body, { ...init, status })
}

/**
 * 为公开 auth 路由响应附加 CORS 头。
 * Token 模式不依赖 cookie,无需 `Access-Control-Allow-Credentials`。
 * 回显请求 Origin(无 Origin 时回退 `*`),允许带 `Authorization` 头。
 */
export function withCors(res: NextResponse, req?: Request): NextResponse {
  const origin = req?.headers.get("origin") ?? "*"
  res.headers.set("Access-Control-Allow-Origin", origin)
  if (origin !== "*") res.headers.set("Vary", "Origin")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.headers.set("Access-Control-Max-Age", "86400")
  return res
}

/**
 * OPTIONS 预检响应。CORS 模式下浏览器会对非简单请求发预检,
 * 小程序 wx.request 不发预检,但 h5 会。
 */
export function corsOptions(req: Request): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }), req)
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type Pagination = z.infer<typeof paginationSchema>

/**
 * 解析分页参数。失败时返回 null，由调用方决定如何返回 4xx 响应。
 * 不再抛错，避免非法参数导致 500。
 */
export function parsePagination(
  searchParams: URLSearchParams
): Pagination | null {
  const raw = {
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  }
  const parsed = paginationSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
