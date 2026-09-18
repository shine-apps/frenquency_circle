import { and, count, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { courseLessons, courses } from "@/db/schema"
import {
  corsOptions,
  fail,
  isUuid,
  ok,
  parsePagination,
  withCors,
} from "@/lib/api"
import { readUserFromToken } from "@/lib/auth/session-token"
import { toPublicCourseDTO } from "@/lib/courses"
import type { Paginated, PublicCourseDTO } from "@/types/api"

/**
 * GET /api/courses
 *
 * 用户端(uni-app)课程列表:分页返回**已上线**(status=active)课程,
 * 按创建时间倒序。
 *
 * **可选登录**:课程属公开内容,token 无效 / 缺失时同样返回列表
 * (与详情接口口径一致;进度 / 播放相关接口仍强制登录)。
 *
 * - 仅 active 可见,pending / offline / rejected / deleted 一律不外泄;
 * - `?creatorId=<id>`:只返回该发布者的已上线课程,供公开主页展示「TA 发布的课程」
 *   (口径对齐 `app/api/activities/route.ts`,对外只暴露 active);
 * - 列表不返回课时明细(lessons 恒为 []),`lessonCount` 由 `course_lessons`
 *   左连接聚合得出 —— 与分页主查询合并为单条 SQL,避免逐课程查课时造成 N+1;
 * - 审核信息 / 创建者信息不下发(见 `lib/courses.toPublicCourseDTO`)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 可选鉴权:仅读取 token(未登录时为 null,不影响公开数据返回)
  await readUserFromToken(req)

  // 2. 解析分页与过滤条件(非法参数返回 400,避免 invalid input 触发 500)
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }
  // creatorId 必须是 uuid,否则 Postgres 抛 22P02 → 500
  const creatorId = url.searchParams.get("creatorId")?.trim()
  if (creatorId && !isUuid(creatorId)) {
    return withCors(fail(400, "creatorId 参数格式不正确"), req)
  }

  // 3. 列表:左连接聚合课时数 + 总时长,与总数共用同一 where(口径一致)
  const where = creatorId
    ? and(eq(courses.creatorId, creatorId), eq(courses.status, "active"))
    : eq(courses.status, "active")

  const rows = await db
    .select({
      course: courses,
      lessonCount: count(courseLessons.id),
      // 仅累计已探测到时长的课时;无课时 / 全部未探测时 SUM 为 null → 0
      totalDuration: sql<number | null>`sum(${courseLessons.durationSeconds})`,
    })
    .from(courses)
    .leftJoin(courseLessons, eq(courseLessons.courseId, courses.id))
    .where(where)
    .groupBy(courses.id)
    .orderBy(desc(courses.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)

  const [totalRow] = await db
    .select({ value: count() })
    .from(courses)
    .where(where)

  const result: Paginated<PublicCourseDTO> = {
    list: rows.map(row =>
      toPublicCourseDTO(
        row.course,
        [],
        Number(row.lessonCount ?? 0),
        Number(row.totalDuration ?? 0)
      )
    ),
    total: Number(totalRow?.value ?? 0),
    page: pagination.page,
    pageSize: pagination.pageSize,
  }

  return withCors(ok(result), req)
}
