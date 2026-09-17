import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { accounts, systemSettings } from "@/db/schema"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { ContentCheckDTO } from "@/types/api"
import type { MsgSecCheckResult } from "@/lib/wechat/miniprogram"

/**
 * 内容安全审核(先审后发)服务端领域逻辑。
 *
 * 前端门禁见 `frontend_uniapp/src/utils/content-moderation.ts`(开关拉取 + fail-closed);
 * 本模块为后端 `/api/content/check` 提供支撑:
 * - 审核开关读取(system_settings,contentModerationEnabled);
 * - 用户微信 openid 解析(msg_sec_check v2 必填,存 accounts 绑定关系);
 * - 超长文本按 UTF-8 字节安全分段(微信单次上限 2500 字节);
 * - 多段审核结果合并与微信 label → 可读名称映射。
 */

/** 系统设置项 key:内容安全审核开关(管理后台「系统设置」可切换,默认关闭) */
export const MODERATION_SETTING_KEY = "contentModerationEnabled"

/**
 * 微信小程序 provider 标识。
 * 与 `auth.ts` 内的 PROVIDER_WECHAT_MP 同值(auth.ts 的常量未导出,此处同步维护;
 * 修改登录 provider id 时必须两处一起改)。
 */
export const PROVIDER_WECHAT_MP = "wechat-miniprogram"

/**
 * 单段文本送审的最大 UTF-8 字节数。
 * 微信 msg_sec_check v2 官方文档的 content 上限为 2500 字;为规避字节/字符口径
 * 差异(汉字 UTF-8 占 3 字节),这里按更保守的**字节**口径切分,任何口径下都不会
 * 超限;代价是长中文文本会多切几段(每段一次 API 调用,配额 4000 次/分钟足够)。
 */
export const MODERATION_MAX_CHUNK_BYTES = 2400

/**
 * 读取审核开关。未配置 / 值非 true 一律视为未开启(默认关闭,宽松放行)。
 * 开关判断以服务端为准:即使前端误调,关闭状态下本接口也直接放行。
 */
export async function isContentModerationEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, MODERATION_SETTING_KEY))
    .limit(1)
  return row?.value === true
}

/**
 * 解析当前用户绑定的微信 openid(msg_sec_check v2 必填)。
 * openid 持久化于 accounts(provider='wechat-miniprogram', providerAccountId=openid),
 * 见 AGENTS.md「WeChat Mini-Program provider」。
 */
export async function findUserWechatOpenid(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ openid: accounts.providerAccountId })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.provider, PROVIDER_WECHAT_MP))
    )
    .limit(1)
  return row?.openid ?? null
}

/**
 * 按 UTF-8 字节数安全分段文本。
 *
 * 微信接口按字节限制请求体,直接按字符数切分会把多字节字符(汉字 3 字节)截断。
 * 本实现按 Unicode code point 逐字累计字节数,保证每段都是合法 UTF-8 且
 * 所有段拼接后与原文完全一致(不丢字、不截断,满足"合规不漏审")。
 *
 * @param text     原文(空串返回 [])
 * @param maxBytes 单段最大字节数(默认 {@link MODERATION_MAX_CHUNK_BYTES})
 */
export function splitTextByUtf8Bytes(
  text: string,
  maxBytes = MODERATION_MAX_CHUNK_BYTES
): string[] {
  const encoder = new TextEncoder()
  const chunks: string[] = []
  let current = ""
  let currentBytes = 0

  for (const char of text) {
    const bytes = encoder.encode(char).length
    if (current && currentBytes + bytes > maxBytes) {
      chunks.push(current)
      current = ""
      currentBytes = 0
    }
    current += char
    currentBytes += bytes
  }
  if (current) chunks.push(current)
  return chunks
}

/**
 * 业务场景 → 微信 msg_sec_check v2 scene 值。
 * 1=资料 2=评论 3=论坛 4=社交日志。
 */
export const SCENE_TO_WECHAT: Record<string, number> = {
  profile: 1,
  comment: 2,
  circle: 3,
  activity: 3,
  checkin: 4,
}

/** 前端契约中的审核结果(见 frontend_uniapp/src/api/content-moderation.ts) */
const SUGGEST_TO_VERDICT: Record<string, ContentCheckDTO["result"]> = {
  pass: "pass",
  risky: "risky",
  review: "review",
}

/**
 * suggest 的严重度(越小越严重)。未知 suggest 视为最严重(fail-closed)。
 */
function severityOf(suggest: string): number {
  switch (suggest) {
    case "risky":
      return 0
    case "review":
      return 1
    case "pass":
      return 2
    default:
      return -1
  }
}

/**
 * 微信 label → 可读名称(仅后端排查用,前端不回显)。
 * 覆盖文档已列label;未知码返回 undefined(响应中不携带,避免编造)。
 */
const MODERATION_LABEL_NAMES: Record<number, string> = {
  100: "正常",
  10001: "广告",
  20001: "时政",
  20002: "色情",
  20003: "辱骂",
  20006: "违法犯罪",
  20008: "欺诈",
  20012: "低俗",
  20013: "版权",
  21000: "其他",
}

export function labelNameOf(label: number): string | undefined {
  return MODERATION_LABEL_NAMES[label]
}

/**
 * 合并多段审核结果为最终裁决。
 *
 * - 取**最严重**段作为整体结果(任一段 risky 即 risky,其次 review,全部 pass 才 pass);
 * - 未知 suggest 直接判 block(fail-closed);
 * - label / labelName / traceId 取最严重段的值,便于排障定位。
 */
export function combineVerdicts(results: MsgSecCheckResult[]): ContentCheckDTO {
  if (results.length === 0) {
    // 理论不可达(调用方保证至少一段);兜底 fail-closed 并记日志
    logger.error(LOG_PREFIX.MODERATION, "no moderation result to combine, fail closed")
    return { result: "block" }
  }

  const worst = results.reduce((a, b) =>
    severityOf(b.suggest) < severityOf(a.suggest) ? b : a
  )
  const result = SUGGEST_TO_VERDICT[worst.suggest] ?? "block"
  const verdict: ContentCheckDTO = { result }
  if (result !== "pass") {
    verdict.label = worst.label
    const name = labelNameOf(worst.label)
    if (name) verdict.labelName = name
  }
  if (worst.traceId) verdict.traceId = worst.traceId
  return verdict
}
