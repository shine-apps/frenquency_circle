import { z } from "zod"

import { corsOptions, fail, isUuid, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { LessonNotFoundError, recordLessonProgress } from "@/lib/courses"

type RouteContext = { params: Promise<{ lessonId: string }> }

/**
 * 上报请求体 schema。
 *
 * - `positionSeconds` 非负,上限 24 小时(对齐 lib/courses 中课时的 max);
 * - 浮点数被允许,但服务端会向下取整 + 二次裁剪到 `lesson.duration_seconds`(若有);
 * - 不接受 `completed` 等字段:视频较短,不记录完成率。
 */
const recordProgressSchema = z.object({
  positionSeconds: z.number().min(0).max(24 * 3600),
})

/**
 * PUT /api/users/me/course-progress/:lessonId
 *
 * 上报 / 更新当前用户对单课时的播放位置(续播定位用)。
 *
 * - 鉴权:任意登录用户
 * - lessonId 必须是 uuid(否则 400,避免 Postgres 22P02 → 500)
 * - lesson 必须存在且所属课程 `status='active'`(否则 404,与 C 端"已下线"语义一致)
 * - 位置裁剪:负数 → 0;超出 `lesson.duration_seconds` → 裁剪到 duration
 * - upsert:同一 (user_id, lesson_id) 重复 PUT 仅更新位置与 updated_at
 * - 返回 `IResponse<CourseLessonProgressDTO>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function PUT(req: Request, context: RouteContext) {
  // 1. 解析路径参数
  const { lessonId } = await context.params
  if (!isUuid(lessonId)) {
    return withCors(fail(400, "lessonId 格式不正确"), req)
  }

  // 2. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 3. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = recordProgressSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  // 4. 落库
  try {
    const result = await recordLessonProgress({
      userId,
      lessonId,
      positionSeconds: parsed.data.positionSeconds,
    })
    return withCors(ok(result), req)
  }
  catch (e) {
    if (e instanceof LessonNotFoundError) {
      return withCors(fail(404, "课时不存在或课程已下线"), req)
    }
    throw e
  }
}