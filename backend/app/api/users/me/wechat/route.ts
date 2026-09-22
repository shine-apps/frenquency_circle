import { z } from "zod"

import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import {
  findUserByAccount,
  hasBoundProvider,
  hasOtherLoginMethod,
  linkAccount,
  unlinkAccount,
} from "@/lib/auth/account-service"
import { code2Session, readWechatMpConfig, WechatMpError } from "@/lib/wechat/miniprogram"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { WechatBindStateDTO } from "@/types/api"

/**
 * 微信登录绑定管理（需登录，Bearer token）。
 *
 * - GET    查询当前账号是否已绑定微信
 * - POST   绑定：body `{ code }`（wx.login 的 js_code）→ code2Session 换 openid →
 *          占用校验（他人已绑 409）→ 写入 accounts(wechat-miniprogram, openid)
 * - DELETE 解绑：删除当前用户的微信绑定记录；账号必须仍有其它登录方式，否则 400
 *
 * 绑定关系以 accounts 表为唯一事实来源，providerAccountId 存 openid。
 */
const bindSchema = z.object({
  code: z.string().min(1),
})

const PROVIDER_WECHAT_MP = "wechat-miniprogram"

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * code2Session 换 openid；配置缺失/微信报错时返回可读响应。
 * 成功返回 openid，失败返回 Response 由调用方直接返回。
 */
async function resolveOpenid(
  code: string,
  req: Request
): Promise<{ openid: string } | { response: Response }> {
  let appId: string
  let appSecret: string
  let apiBase: string
  try {
    const cfg = readWechatMpConfig()
    appId = cfg.appId
    appSecret = cfg.appSecret
    apiBase = cfg.apiBase
  } catch (err) {
    logger.error(LOG_PREFIX.WECHAT, "Bind: missing app config", {
      error: errMessage(err),
    })
    return { response: withCors(fail(500, "微信登录服务未配置"), req) }
  }

  try {
    const session = await code2Session({ appId, appSecret, code, apiBase })
    return { openid: session.openid }
  } catch (err) {
    if (err instanceof WechatMpError) {
      logger.warn(LOG_PREFIX.WECHAT, "Bind: code2Session failed", {
        errcode: err.errcode,
        errmsg: err.errmsg,
      })
      return {
        response: withCors(
          fail(400, `微信登录凭证校验失败 errcode=${err.errcode} msg=${err.errmsg}`),
          req
        ),
      }
    }
    logger.error(LOG_PREFIX.WECHAT, "Bind: code2Session error", {
      error: errMessage(err),
    })
    return { response: withCors(fail(500, "微信登录服务异常"), req) }
  }
}

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

/** GET /api/users/me/wechat —— 查询当前账号微信绑定状态 */
export async function GET(req: Request) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  const bound = await hasBoundProvider(guard.user.id, PROVIDER_WECHAT_MP)
  const data: WechatBindStateDTO = { bound }
  return withCors(ok(data), req)
}

/** POST /api/users/me/wechat —— 绑定微信（body: { code }） */
export async function POST(req: Request) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const body = await req.json().catch(() => null)
  const parsed = bindSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn(LOG_PREFIX.WECHAT, "Bind: invalid body")
    return withCors(fail(400, "无效的请求参数", parsed.error.flatten()), req)
  }

  const resolved = await resolveOpenid(parsed.data.code, req)
  if ("response" in resolved) return resolved.response
  const { openid } = resolved

  const owner = await findUserByAccount(PROVIDER_WECHAT_MP, openid)
  if (owner && owner.id !== userId) {
    logger.warn(LOG_PREFIX.WECHAT, "Bind: openid already bound to another user", {
      userId,
      ownerId: owner.id,
    })
    return withCors(fail(409, "该微信已绑定其他账号，请先解绑后再试"), req)
  }

  // 本人已绑定 => 幂等成功；否则写入绑定
  if (!owner) {
    await linkAccount({
      userId,
      provider: PROVIDER_WECHAT_MP,
      providerAccountId: openid,
      type: "oauth",
    })
    logger.info(LOG_PREFIX.WECHAT, "WeChat bound", { userId })
  }

  const data: WechatBindStateDTO = { bound: true }
  return withCors(ok(data), req)
}

/** DELETE /api/users/me/wechat —— 解绑微信（需保证账号仍有其它登录方式） */
export async function DELETE(req: Request) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const bound = await hasBoundProvider(userId, PROVIDER_WECHAT_MP)
  if (!bound) {
    logger.warn(LOG_PREFIX.WECHAT, "Unbind: wechat not bound", { userId })
    return withCors(fail(400, "当前账号未绑定微信"), req)
  }

  // 解绑守卫：账号必须仍有非微信的登录方式（手机号/邮箱等），否则会彻底无法登录
  const hasOther = await hasOtherLoginMethod(userId, PROVIDER_WECHAT_MP)
  if (!hasOther) {
    logger.warn(LOG_PREFIX.WECHAT, "Unbind rejected: no other login method", {
      userId,
    })
    return withCors(
      fail(400, "解绑后将无法登录，请先绑定手机号或邮箱后再解绑微信"),
      req
    )
  }

  // 守卫写入 SQL 的 EXISTS 子查询，与删除原子完成（并发下不会解掉唯一登录方式）
  const removed = await unlinkAccount({
    userId,
    provider: PROVIDER_WECHAT_MP,
  })
  if (removed === 0) {
    logger.warn(LOG_PREFIX.WECHAT, "Unbind: nothing removed (guard or race)", {
      userId,
    })
    return withCors(
      fail(400, "解绑后将无法登录，请先绑定手机号或邮箱后再解绑微信"),
      req
    )
  }

  logger.info(LOG_PREFIX.WECHAT, "WeChat unbound", { userId, removed })
  const data: WechatBindStateDTO = { bound: false }
  return withCors(ok(data), req)
}
