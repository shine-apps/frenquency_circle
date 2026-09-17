import { z } from "zod"

import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import {
  combineVerdicts,
  findUserWechatOpenid,
  isContentModerationEnabled,
  SCENE_TO_WECHAT,
  splitTextByUtf8Bytes,
} from "@/lib/content-moderation"
import { logger, LOG_PREFIX } from "@/lib/logger"
import {
  getAccessToken,
  msgSecCheck,
  readWechatMpConfig,
  WechatMpError,
} from "@/lib/wechat/miniprogram"
import type { ContentCheckDTO } from "@/types/api"
import type { MsgSecCheckResult } from "@/lib/wechat/miniprogram"

/**
 * 文本内容安全审核(先审后发)。
 *
 * 契约与前端对齐:frontend_uniapp/src/api/content-moderation.ts 的 checkText(),
 * 前端在发布圈子 / 打卡 / 活动前调用,result === 'pass' 才放行;接口异常时前端按
 * fail-closed 拦截(提示「内容审核服务暂时不可用」)。
 *
 * 流程:
 * 1. `requireSession` 鉴权(登录用户);
 * 2. 服务端权威读取审核开关 `contentModerationEnabled`,未开启直接放行 200;
 * 3. 从 accounts 绑定关系解析 openid(msg_sec_check v2 必填;未绑定微信 → 503 拦截);
 * 4. 复用 `lib/wechat/miniprogram.ts` 的 access_token 调用微信 msg_sec_check v2,
 *    超长文本按 UTF-8 字节安全分段后逐段审核,取最严重结果合并返回;
 * 5. 微信侧任何异常(配置缺失 / 上游错误 / 响应异常)统一 503,fail-closed。
 *
 * 隐私:微信响应 detail 中的命中关键词等敏感信息不入响应,仅记 label/labelName/traceId
 * 供后端排障;前端承诺不回显命中词(微信内容安全合规要求)。
 *
 * 失败语义:400(参数非法)/ 401(未登录)/ 503(审核服务不可用,含未绑定微信)。
 * 暂不支持图片 / 音视频审核(前端本次范围仅文本)。
 */
export const dynamic = "force-dynamic"

/** 审核服务不可用的统一对外文案(与前端 toast 文案一致,便于联调对齐) */
const UNAVAILABLE_MESSAGE = "内容审核服务暂时不可用,请稍后重试"

/** 待审核文本长度上限(字符):覆盖打卡 1000 字上限及圈子标题+描述拼接场景 */
const CONTENT_MAX_CHARS = 5000

const checkTextSchema = z.object({
  /** 本次仅支持文本审核,与前端 checkText 契约一致 */
  type: z.literal("text"),
  content: z.string().trim().min(1).max(CONTENT_MAX_CHARS),
  /** 业务场景标识(用于映射微信 scene 值),缺省按论坛类处理 */
  scene: z.enum(["circle", "checkin", "activity", "comment", "profile"]).default("circle"),
})

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 入参校验
  const body = await req.json().catch(() => null)
  const parsed = checkTextSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(fail(400, "Invalid request body", parsed.error.flatten()), req)
  }
  const { content, scene } = parsed.data

  try {
    // 3. 开关以服务端为准:未开启(默认)直接放行,不产生微信调用
    if (!(await isContentModerationEnabled())) {
      return withCors(ok<ContentCheckDTO>({ result: "pass" }), req)
    }

    // 4. openid 必填(v2):从 accounts 绑定关系解析;
    //    未绑定微信的账号无法送审,按 fail-closed 拦截(合规优先于可用性)
    const openid = await findUserWechatOpenid(userId)
    if (!openid) {
      logger.warn(LOG_PREFIX.MODERATION, "text check blocked: no wechat openid binding", {
        userId,
        scene,
      })
      return withCors(fail(503, UNAVAILABLE_MESSAGE), req)
    }

    // 5. access_token + 分段送审(单段 ≤ 2400 字节,全量覆盖不漏审)
    const { appId, appSecret, apiBase } = readWechatMpConfig()
    const accessToken = await getAccessToken({ appId, appSecret, apiBase })
    const chunks = splitTextByUtf8Bytes(content)
    const results: MsgSecCheckResult[] = []
    for (const chunk of chunks) {
      results.push(
        await msgSecCheck({
          accessToken,
          openid,
          scene: SCENE_TO_WECHAT[scene] ?? 3,
          content: chunk,
          apiBase,
        })
      )
    }
    const verdict = combineVerdicts(results)

    logger.info(LOG_PREFIX.MODERATION, "text checked", {
      userId,
      scene,
      chunks: chunks.length,
      result: verdict.result,
      label: verdict.label,
      traceId: verdict.traceId,
    })
    return withCors(ok<ContentCheckDTO>(verdict), req)
  } catch (err) {
    // 6. fail-closed:上游/配置/未知异常一律 503,由前端拦截发布
    if (err instanceof WechatMpError) {
      logger.error(LOG_PREFIX.MODERATION, "text check upstream failed", {
        userId,
        scene,
        stage: err.stage,
        errcode: err.errcode,
        errmsg: err.errmsg,
      })
    } else {
      logger.error(LOG_PREFIX.MODERATION, "text check failed unexpectedly", {
        userId,
        scene,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return withCors(fail(503, UNAVAILABLE_MESSAGE), req)
  }
}
