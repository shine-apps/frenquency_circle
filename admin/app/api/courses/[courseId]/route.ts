import { corsOptions, fail, isUuid, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import {
  getCourseWithLessons,
  toCourseLessonDTO,
  toPublicCourseDTO,
} from "@/lib/courses"

type RouteContext = { params: Promise<{ courseId: string }> }

/**
 * GET /api/courses/:courseId
 *
 * 用户端(uni-app)课程详情:返回课程信息与全部课时(按 sortOrder 升序),
 * 供课程详情页展示与视频播放。
 *
 * - 课程不存在或非 active 一律 404 —— 不区分"未上线"与"不存在",
 *   避免审核状态外泄(课程 id 可被枚举);
 * - 审核信息 / 创建者信息不下发(见 `lib/courses.toPublicCourseDTO`);
 * - 路径参数先过 `isUuid`,避免非法文本触发 Postgres 22P02 → 500。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request, context: RouteContext) {
  // 1. 鉴权(Bearer token,与小程序 / H5 业务接口一致)
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  // 2. 路径参数必须是 uuid,否则 Postgres 抛 22P02 → 500
  const { courseId } = await context.params
  if (!isUuid(courseId)) {
    return withCors(fail(400, "courseId 格式不正确"), req)
  }

  // 3. 课程 + 课时(未上线按不存在处理)
  const loaded = await getCourseWithLessons(courseId)
  if (!loaded || loaded.course.status !== "active") {
    return withCors(fail(404, "课程不存在"), req)
  }

  const lessons = loaded.lessons.map(toCourseLessonDTO)

  return withCors(ok(toPublicCourseDTO(loaded.course, lessons)), req)
}
