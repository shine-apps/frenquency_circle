import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { checkins, circleFollows, circles, hobbyTags } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { hydrateCheckins } from "@/lib/checkins"
import { resolveCosConfig } from "@/lib/cos/config"
import { logger, LOG_PREFIX } from "@/lib/logger"

/** 打卡正文长度上限 */
const CONTENT_MAX = 1000
/** 单条打卡的兴趣标签上限(与 users.tags 上限一致) */
const TAGS_MAX = 10
/** 单条打卡的图片上限 */
const IMAGES_MAX = 9

/**
 * 允许的媒体 URL 前缀(本应用 COS 公网基址,上传唯一通道)。
 * COS 未配置时返回 null,此时跳过前缀校验(配置缺失的降级场景)。
 */
function allowedMediaPrefix(): string | null {
  try {
    return `${resolveCosConfig().publicBaseUrl}/`
  }
  catch {
    return null
  }
}

/**
 * 媒体 URL:必须由本站 COS 直传产生。
 * 仅校验长度会让任意外链(追踪像素、外部大文件、未来的富文本注入)落库并被渲染给所有用户,
 * 因此与「客户端直传 COS」链路对齐,做来源白名单校验。
 */
const mediaUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (url) => {
      const prefix = allowedMediaPrefix()
      return !prefix || url.startsWith(prefix)
    },
    { message: "媒体地址必须是本站上传的文件" }
  )

/**
 * 创建打卡请求体 schema。
 *
 * - `content` 可空:允许纯媒体打卡;
 * - 媒体二选一:`images`(≤9)与 `videoUrl` 不能同时存在;
 * - 三者至少有一项(否则打卡无内容);
 * - 媒体地址必须指向本站 COS(见 `mediaUrlSchema`)。
 */
const createCheckinSchema = z
  .object({
    content: z.string().trim().max(CONTENT_MAX).optional(),
    circleId: z.string().uuid().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(TAGS_MAX).default([]),
    images: z.array(mediaUrlSchema).max(IMAGES_MAX).default([]),
    videoUrl: mediaUrlSchema.optional(),
  })
  .refine(
    (v) => !!v.content || v.images.length > 0 || !!v.videoUrl,
    { message: "打卡内容不能为空", path: ["content"] }
  )
  .refine((v) => !v.videoUrl || v.images.length === 0, {
    message: "视频与图片不能同时上传",
    path: ["videoUrl"],
  })

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

/**
 * POST /api/checkins
 *
 * 发布一条打卡。
 *
 * - 鉴权:任意登录用户;
 * - `circleId` 可选,但必须是「当前用户关注的 active 圈子」(需求:打卡到自己关注的圈子);
 * - `tags` 为兴趣标签名称,校验其在 hobby_tags 中存在且 approved(与保存兴趣标签同口径);
 * - 媒体最多 9 张图片或 1 个视频,互斥;
 * - 返回 `IResponse<CheckinDTO>`(201)。
 */
export async function POST(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = createCheckinSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  // 3. 归一化:正文空串视为未填写;标签去重且保持首现顺序
  const content = parsed.data.content?.trim() || null
  const tags = Array.from(new Set(parsed.data.tags))
  const images = parsed.data.images
  const videoUrl = parsed.data.videoUrl ?? null

  // 4. 标签存在性校验(仅 approved 可被打卡引用)
  if (tags.length > 0) {
    const existingTags = await db
      .select({ name: hobbyTags.name })
      .from(hobbyTags)
      .where(
        and(inArray(hobbyTags.name, tags), eq(hobbyTags.status, "approved"))
      )
    const existingNames = new Set(existingTags.map((t) => t.name))
    const missing = tags.filter((name) => !existingNames.has(name))
    if (missing.length > 0) {
      return withCors(
        fail(400, "部分标签不存在或未通过审核", { missingTags: missing }),
        req
      )
    }
  }

  // 5. 圈子归属校验:必须是当前用户关注的 active 圈子
  const circleId = parsed.data.circleId ?? null
  if (circleId) {
    const [followRow] = await db
      .select({ circleId: circleFollows.circleId })
      .from(circleFollows)
      .where(
        and(
          eq(circleFollows.userId, userId),
          eq(circleFollows.circleId, circleId)
        )
      )
    if (!followRow) {
      return withCors(fail(400, "只能打卡到自己关注的圈子"), req)
    }

    const [circleRow] = await db
      .select({ id: circles.id, status: circles.status })
      .from(circles)
      .where(eq(circles.id, circleId))
    if (!circleRow || circleRow.status !== "active") {
      return withCors(fail(400, "圈子不存在或已下线"), req)
    }
  }

  // 6. 写入打卡(单表插入,无跨表事务)
  const [row] = await db
    .insert(checkins)
    .values({
      userId,
      content,
      circleId,
      tags,
      images,
      videoUrl,
    })
    .returning()

  logger.info(LOG_PREFIX.CHECKIN, "checkin created", {
    checkinId: row.id,
    userId,
    circleId,
    imageCount: images.length,
    hasVideo: !!videoUrl,
    tagCount: tags.length,
  })

  const [dto] = await hydrateCheckins([row])
  if (!dto) {
    // 理论上不可达:入参长度为 1 时 hydrateCheckins 必然返回 1 条
    // (兜底而非类型断言,避免把潜在 undefined 静默透出成「201 + 空 data」)
    logger.error(LOG_PREFIX.CHECKIN, "hydrate created checkin failed", {
      checkinId: row.id,
    })
    return withCors(fail(500, "打卡创建成功但读取失败,请稍后重试"), req)
  }
  return withCors(ok(dto, { status: 201 }), req)
}
