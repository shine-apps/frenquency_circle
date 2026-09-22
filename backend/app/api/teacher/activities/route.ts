import { fail, ok } from "@/lib/api"
import { requireTeacher } from "@/lib/auth-utils"
import {
  createActivity,
  createActivitySchema,
  toActivityDTO,
  type CreateActivityInput,
} from "@/lib/activities"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * POST /api/teacher/activities
 *
 * 教师在后台发布活动。与 C 端 `POST /api/activities` 共用 `lib/activities`
 * 的 `createActivity`,差别只在鉴权方式:本路由走 NextAuth cookie session,
 * 角色门槛 `TEACHER | ADMIN`(见 `requireTeacher`)。
 */
export async function POST(req: Request) {
  // 1. 鉴权(cookie session;TEACHER / ADMIN)
  const guard = await requireTeacher()
  if (!guard.ok) return guard.response

  // 2. 解析并校验请求体(与 C 端同一份 schema)
  const body = await req.json().catch(() => null)
  const parsed = createActivitySchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }
  const input = parsed.data as CreateActivityInput

  // 3. 落库
  const inserted = await createActivity({ creatorId: guard.userId, input })

  logger.info(LOG_PREFIX.CIRCLE, "Teacher created activity", {
    activityId: inserted.id,
    creatorId: guard.userId,
    role: guard.role,
  })

  return ok(toActivityDTO(inserted), { status: 201 })
}
