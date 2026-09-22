import { corsOptions, fail, ok, withCors, parsePagination } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import type { NotificationDTO, Paginated } from "@/types/api"
import { listNotifications } from "@/lib/notifications"

/**
 * GET /api/notifications
 *
 * 当前用户的小程序端通知列表(分页,按时间倒序)。
 * 仅返回 `linkTarget = 'miniprogram'` 的通知(后台通知由后台铃铛接口负责,互不串扰)。
 * 支持查询参数:page / pageSize / unreadOnly(=true 仅未读)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }
  const unreadOnly = url.searchParams.get("unreadOnly") === "true"

  const res = await listNotifications({
    recipientId: userId,
    linkTarget: "miniprogram",
    page: pagination.page,
    pageSize: pagination.pageSize,
    unreadOnly,
  })

  const result: Paginated<NotificationDTO> = {
    list: res.list,
    total: res.total,
    page: res.page,
    pageSize: res.pageSize,
  }
  return withCors(ok(result), req)
}
