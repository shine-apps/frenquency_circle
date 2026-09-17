import { z } from "zod"

import { corsOptions, fail, isUuid, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { getCourseProgress } from "@/lib/courses"

/**
 * `?courseId=` 查询 schema。uuid 校验前置,避免 Postgres 22P02 → 500。
 */
const querySchema = z.object({
  courseId: z.string().refine(isUuid, "courseId 格式不正确"),
})

/**
 * GET /api/users/me/course-progress?courseId=:id
 *
 * 拉取当前用户在指定课程下的所有课时进度(用于课程详情页 ✓ 角标 /
 * 自动续播时的 `initialPosition` 初始化)。
 *
 * - 鉴权:任意登录用户
 * - courseId 必填且必须是 uuid(否则 400)
 * - 只返回该课程内的课时进度(join courseLessons.course_id 限定);
 *   用户在课程 A 的进度不会因误传 courseId=B 而泄漏
 * - 课程不存在 / 非 active:返回空列表(与"用户没看过"语义等价)
 * - 返回 `IResponse<{ list: CourseLessonProgressDTO[] }>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析查询参数
  const url = new URL(req.url)
  const courseIdRaw = url.searchParams.get("courseId")?.trim()
  if (!courseIdRaw) {
    return withCors(fail(400, "courseId 必填"), req)
  }
  const parsed = querySchema.safeParse({ courseId: courseIdRaw })
  if (!parsed.success) {
    return withCors(fail(400, "courseId 格式不正确"), req)
  }

  // 3. 拉取进度(无 active 过滤 —— 课程本身已下线也允许前端做"上次看到这"清理)
  const list = await getCourseProgress(userId, parsed.data.courseId)
  return withCors(ok({ list }), req)
}