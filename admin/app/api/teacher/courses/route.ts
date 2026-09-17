import { fail, ok } from "@/lib/api"
import { requireTeacher } from "@/lib/auth-utils"
import {
  createCourse,
  createCourseSchema,
  toCourseDTO,
  toCourseLessonDTO,
  type CreateCourseInput,
} from "@/lib/courses"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * POST /api/teacher/courses
 *
 * 教师在后台创建视频课程(status 恒为 pending,需管理员审核)。
 * 课程与课时在同一事务内写入,任一失败整体回滚(见 lib/courses.createCourse)。
 */
export async function POST(req: Request) {
  // 1. 鉴权(cookie session;TEACHER / ADMIN)
  const guard = await requireTeacher()
  if (!guard.ok) return guard.response

  // 2. 解析并校验请求体
  const body = await req.json().catch(() => null)
  const parsed = createCourseSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }
  const input = parsed.data as CreateCourseInput

  // 3. 事务落库
  const created = await createCourse({ creatorId: guard.userId, input })

  logger.info(LOG_PREFIX.COURSE, "Teacher created course", {
    courseId: created.course.id,
    lessonCount: created.lessons.length,
    creatorId: guard.userId,
    role: guard.role,
  })

  return ok(toCourseDTO(created.course, created.lessons.map(toCourseLessonDTO)), {
    status: 201,
  })
}
