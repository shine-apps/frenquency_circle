import { z } from "zod"

import { fail, ok } from "@/lib/api"
import { requireTeacher } from "@/lib/auth-utils"
import { createCircle, createCircleSchema } from "@/lib/circles"

/**
 * POST /api/teacher/circles
 *
 * 教师在后台创建圈子。与 C 端 `POST /api/circles` 共用 `lib/circles` 的
 * `createCircle`(24h 配额 / 标签白名单 / 落库 / 通知 / 兴趣事件),
 * 差别只在鉴权方式:本路由走 NextAuth cookie session,角色门槛
 * `TEACHER | ADMIN`(见 `requireTeacher`)。
 *
 * 返回 201 + `{ circleId, status: "pending" }`;等管理员审核通过后上线。
 */
export async function POST(req: Request) {
  // 1. 鉴权(cookie session;TEACHER / ADMIN)
  const guard = await requireTeacher()
  if (!guard.ok) return guard.response

  // 2. 解析请求体(与 C 端同一份 schema)
  const body = await req.json().catch(() => null)
  const parsed = createCircleSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", z.treeifyError(parsed.error))
  }

  // 3. 创建圈子(共享业务规则)
  const result = await createCircle({ creatorId: guard.userId, input: parsed.data })
  if (!result.ok) {
    return fail(result.status, result.message, result.details)
  }

  return ok({ circleId: result.circleId, status: result.status }, { status: 201 })
}
