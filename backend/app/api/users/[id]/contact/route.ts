import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { contactLogs, users } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { resolveUserContact } from "@/lib/contacts"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/users/:id/contact
 *
 * 查看并解锁对方的联系方式(人-人联系留痕)。
 *
 * - 鉴权:任意登录用户
 * - 可见性由 `resolveUserContact` 统一判定:
 *   双方已通过打招呼建立联系 / 本人查看自己 才可见(公开设置不影响)
 * - 优先返回微信号;微信号缺失且有权查看时,兜底返回手机号(contactType 指示类型)
 * - 每次成功查看写入 contactLogs(targetUserId, contactType) 用于统计与滥用追溯;
 *   查看自己的联系方式不写日志
 * - 失败:400 对自己留痕无意义之外的非法场景 / 403 无权查看 / 404 用户不存在
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request, context: RouteContext) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const viewerId = guard.user.id

  const { id } = await context.params

  // 2. 校验目标用户存在
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  if (!target) {
    return withCors(fail(404, "用户不存在"), req)
  }

  // 3. 可见性判定(微信号缺失时按权限兜底返回手机号)
  const { visibility } = await resolveUserContact(viewerId, id)
  if (!visibility.visible || !visibility.contactType) {
    logger.info(LOG_PREFIX.CONTACT, "user contact blocked", {
      viewerId,
      targetId: id,
      reason: visibility.reason,
    })
    return withCors(fail(403, "对方暂未开放联系方式,可先打招呼"), req)
  }

  // 4. 留痕(查看自己不记录)
  if (visibility.reason !== "self") {
    await db.insert(contactLogs).values({
      userId: viewerId,
      targetUserId: id,
      contactType: visibility.contactType,
    })
    logger.info(LOG_PREFIX.CONTACT, "user contact viewed", {
      viewerId,
      targetId: id,
      contactType: visibility.contactType,
      reason: visibility.reason,
    })
  }

  return withCors(
    ok({
      wechat: visibility.wechat,
      phone: visibility.phone,
      contactType: visibility.contactType,
    }),
    req
  )
}
