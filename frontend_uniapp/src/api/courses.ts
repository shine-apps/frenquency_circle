import { http } from '@/http/http'
import type { PublicCourseDTO, PublicCourseListDTO } from '@/types'

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

/** 视频课程详情(含全部课时,按 sortOrder 升序;未上线或不存在返回 404) */
export function getCourse(courseId: string) {
  return http.get<PublicCourseDTO>(
    `/api/courses/${encodeURIComponent(courseId)}`,
  )
}
