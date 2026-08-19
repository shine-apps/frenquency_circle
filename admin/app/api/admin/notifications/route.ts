import { fail, ok, withCors, parsePagination } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import type { NotificationDTO, Paginated } from "@/types/api"
import { listNotifications } from "@/lib/notifications"

/**
 * GET /api/admin/notifications
 *
 * 后台管理员的后台通知列表(分页,按时间倒序)。
 * 仅返回 `linkTarget = 'admin'` 的通知(由 notifyAdmins 写入),与小程序端互不串扰。
 * 支持查询参数:page / pageSize / unreadOnly(=true 仅未读)。
 */
export async function GET(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const adminId = guard.userId

  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }
  const unreadOnly = url.searchParams.get("unreadOnly") === "true"

  const res = await listNotifications({
    recipientId: adminId,
    linkTarget: "admin",
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
