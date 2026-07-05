import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, contactLogs } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/** 联系请求体 schema */
const contactSchema = z.object({
  contactType: z.union([z.literal("phone"), z.literal("wechat")]),
})

/**
 * POST /api/circles/:id/contact
 *
 * 学员联系老师:插入 contact_logs 记录,返回圈子联系方式。
 * 圈子不存在或非 active 返回 404。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = contactSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  // 3. 校验圈子存在且 active
  const [circleRow] = await db
    .select({
      id: circles.id,
      contactPhone: circles.contactPhone,
      wechat: circles.wechat,
      status: circles.status,
    })
    .from(circles)
    .where(eq(circles.id, id))
  if (!circleRow || circleRow.status !== "active") {
    return withCors(fail(404, "圈子不存在或已下线"), req)
  }

  // 4. 插入 contact_logs
  await db.insert(contactLogs).values({
    circleId: id,
    userId,
    contactType: parsed.data.contactType,
  })

  logger.info(LOG_PREFIX.CIRCLE, "Circle contacted", {
    circleId: id,
    userId,
    contactType: parsed.data.contactType,
  })

  // 5. 返回联系方式(空值返回 null)
  return withCors(
    ok({
      contactPhone: circleRow.contactPhone ?? null,
      wechat: circleRow.wechat ?? null,
    }),
    req
  )
}
