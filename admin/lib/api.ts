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
