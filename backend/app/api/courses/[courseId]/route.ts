import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { corsOptions, fail, isUuid, ok, withCors } from "@/lib/api"
import { readUserFromToken } from "@/lib/auth/session-token"
import {
  getCourseWithLessons,
  getFollowedCourseIds,
  toCourseLessonDTO,
  toPublicCourseDetailDTO,
} from "@/lib/courses"

type RouteContext = { params: Promise<{ courseId: string }> }

/**
 * GET /api/courses/:courseId
 *
 * 用户端(uni-app)课程详情:返回课程信息与全部课时(按 sortOrder 升序),
 * 另附创建者轻量信息(老师入口 → 公开主页跳转用)。
 *
 * **可选登录**:分享链路允许未登录用户查看课程信息(产品决策),
 * 仅「播放」动作由前端拦到登录页,故本接口不再强制 requireSession;
 * token 无效 / 缺失时同样返回完整课程数据(响应与登录态无关)。
 *
 * - 课程不存在或非 active 一律 404 —— 不区分"未上线"与"不存在",
 *   避免审核状态外泄(课程 id 可被枚举);
 * - 审核信息不下发;创建者只暴露 id / name / avatarUrl 三个公开字段,
 *   与 CircleDetailDTO.creator 同构(不含邮箱 / 手机号);
 * - 创建者被软删除时 `teacher: null`,前端按无老师入口渲染;
 * - 路径参数先过 `isUuid`,避免非法文本触发 Postgres 22P02 → 500。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request, context: RouteContext) {
  // 1. 可选鉴权:读取 token(未登录时为 null,不影响公开数据返回)
  const viewer = await readUserFromToken(req)

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

  // 4. 创建者轻量信息(仅公开字段;查不到时前端不渲染老师入口)
  const [teacherRow] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, loaded.course.creatorId))
    .limit(1)

  const lessons = loaded.lessons.map(toCourseLessonDTO)

  // 5. 登录用户下发 isFollowed(单条查询,未登录恒为 false)
  const followedCourseIds = await getFollowedCourseIds(viewer?.id, [
    loaded.course.id,
  ])

  return withCors(
    ok(
      toPublicCourseDetailDTO(
        loaded.course,
        teacherRow
          ? {
              id: teacherRow.id,
              name: teacherRow.name,
              avatarUrl: teacherRow.avatarUrl,
            }
          : null,
        lessons,
        followedCourseIds.has(loaded.course.id)
      )
    ),
    req
  )
}

