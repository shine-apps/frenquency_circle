import { http } from '@/http/http'
import type {
  CourseProgressListDTO,
  PublicCourseDTO,
  PublicCourseDetailDTO,
  PublicCourseListDTO,
  RecentCourseListDTO,
} from '@/types'

/** 课程列表查询参数 */
export interface CourseListParams {
  page?: number
  pageSize?: number
  /** 指定发布者(仅返回其已上线课程),公开主页展示「TA 发布的课程」时使用 */
  creatorId?: string
}

/** 课程列表公共 query 构造(未传字段不下发,由后端取默认值) */
function toListQuery(params?: CourseListParams) {
  return {
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
    ...(params?.creatorId ? { creatorId: params.creatorId } : {}),
  }
}

/**
 * 视频课程列表(分页,按创建时间倒序,仅已上线课程)。
 *
 * - 列表项不返回课时明细(`lessons` 恒为 `[]`),`lessonCount` 为课时数;
 * - `creatorId` 可查看指定发布者的课程(公开主页用,仅 active);
 * - 接口需登录,未登录由 http 拦截统一跳登录页。
 */
export function getCourses(params?: CourseListParams) {
  return http.get<PublicCourseListDTO>('/api/courses', toListQuery(params))
}

/** 视频课程详情(含全部课时 + 老师入口信息;未上线或不存在返回 404) */
export function getCourse(courseId: string) {
  return http.get<PublicCourseDetailDTO>(
    `/api/courses/${encodeURIComponent(courseId)}`,
  )
}

// ---- 课时播放进度(course_lesson_progress) ----

/**
 * 上报单课时的播放位置(续播定位用)。
 *
 * 视频较短,只上报 positionSeconds,不记录完成率。
 * 由 `VideoPlayer` 的 `progress` 事件触发,客户端节流到约 5s/次,
 * 暂停 / 结束 / 组件卸载时强制上报最后一次位置。
 *
 * 失败处理:`http` 拦截器已统一错误提示,本调用无需额外 try/catch;
 * 单次上报失败不影响播放与下次续播(下次打开时位置仍停留在最后一次成功上报的值)。
 */
export function reportLessonProgress(
  lessonId: string,
  positionSeconds: number,
) {
  return http.put<{ lessonId: string; positionSeconds: number; updatedAt: string }>(
    `/api/users/me/course-progress/${encodeURIComponent(lessonId)}`,
    { positionSeconds: Math.floor(positionSeconds) },
  )
}

/**
 * 拉取单课程下当前用户的所有课时进度。
 *
 * 用于课程详情页初始化 `initialPosition`(传入 `VideoPlayer`)
 * 以及课时项的「上次学到哪」视觉标记。
 * 课程不存在 / 用户没看过 → 返回空数组。
 */
export function getCourseProgress(courseId: string) {
  return http.get<CourseProgressListDTO>(
    '/api/users/me/course-progress',
    { courseId },
  )
}

/**
 * 最近学习列表(按更新时间倒序,聚合到课程粒度)。
 *
 * - 单用户最近窗口内数据量天然有限,接口不分页;
 * - 用于 me 页「继续观看」二级入口;
 * - 上限 50 条由后端兜底。
 */
export function getRecentCourses(params?: { limit?: number }) {
  const query: Record<string, number> = {}
  if (params?.limit !== undefined) query.limit = params.limit
  return http.get<RecentCourseListDTO>('/api/users/me/courses/recent', query)
}
