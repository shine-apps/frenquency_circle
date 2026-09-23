import { corsOptions, fail, isUuid, ok, parsePagination, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { getFollowedCourses } from "@/lib/courses"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * GET /api/courses/followed
 *
 * 返回指定用户关注的视频课程列表(分页,按关注时间倒序,排除未上线课程)。
 * - `?userId=<id>`:查看该用户关注的课程(公开主页复用,口径与
 *   `/api/circles/followed` / `/api/users/followed` 一致);
 *   缺省为当前登录用户自己的关注列表;
 * - 每项附带 `teacher`(课程作者)与 `lessonCount / totalDurationSeconds`,
 *   供关注列表卡片直接渲染,无需再额外请求课程详情。
 *
 * 静态段 `followed` 优先于动态段 `[courseId]`,不会与课程详情路由冲突
 * (与 `circles/followed` 现状一致)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const currentUserId = guard.user.id

  // 2. 解析分页与目标用户(显式传 userId 时必须是 uuid,否则 Postgres 抛 22P02 → 500)
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }
  const userIdParam = url.searchParams.get("userId")?.trim()
  if (userIdParam && !isUuid(userIdParam)) {
    return withCors(fail(400, "userId 参数格式不正确"), req)
  }
  /** 关注列表归属用户:默认自己,传 userId 时查看他人(公开主页) */
  const userId = userIdParam || currentUserId

  // 3. 查询 + 组装(过滤非 active 与批量补作者 / 课时数在 lib 层完成)
  const result = await getFollowedCourses(userId, pagination)

  // 查看他人关注列表属半公开信息,留痕便于审计(与 circles/followed 一致)
  if (userId !== currentUserId) {
    logger.info(LOG_PREFIX.COURSE, "followed courses viewed", {
      viewerId: currentUserId,
      targetId: userId,
    })
  }

  return withCors(ok(result), req)
}
