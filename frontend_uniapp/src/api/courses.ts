import { http } from '@/http/http'
import type {
  CourseProgressListDTO,
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
  /** 检索关键词:命中「标题 / 简介 / 标签」(服务端 ILIKE,空值不下发) */
  keyword?: string
}

/** 课程列表公共 query 构造(未传字段不下发,由后端取默认值) */
function toListQuery(params?: CourseListParams) {
  return {
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
    ...(params?.creatorId ? { creatorId: params.creatorId } : {}),
    ...(params?.keyword ? { keyword: params.keyword } : {}),
  }
}

/**
 * 视频课程列表(分页,按创建时间倒序,仅已上线课程)。
 *
 * - 列表项不返回课时明细(`lessons` 恒为 `[]`),`lessonCount` 为课时数;
 * - `creatorId` 可查看指定发布者的课程(公开主页用,仅 active);
 * - `keyword` 按「标题 / 简介 / 标签」检索(广场课程 tab 的搜索框用);
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

// ---- 发布视频课程(C 端,任意登录用户) ----

/** 课时提交入参(视频需先经 uploadFileToCos 直传拿到公网 URL) */
export interface CourseLessonInput {
  /** 课时标题(1-100 字符) */
  title: string
  /** 课时简介(0-500 字符,可空) */
  description?: string
  /** 课时视频 COS 公网 URL */
  videoUrl: string
  /** 视频时长(秒,未知传 null) */
  durationSeconds?: number | null
}

/** 课程提交入参(status 由服务端固定为 pending,不接受客户端指定) */
export interface CreateCourseInput {
  /** 课程标题(2-100 字符) */
  title: string
  /** 课程简介(10-5000 字符) */
  description: string
  /** 封面 / 轮播图 URL 数组(0-9 张) */
  coverImages?: string[]
  /** 兴趣标签名称数组(0-5 个) */
  tags?: string[]
  /** 课时列表(0-30 个,允许先建课后补课时;提交顺序即展示顺序) */
  lessons: CourseLessonInput[]
}

/** 课程创建结果(后端 CourseDTO 的 C 端消费字段) */
export interface CreateCourseResult {
  id: string
  /** 恒为 pending,需管理员审核通过后上线 */
  status: string
}

/**
 * 发布视频课程(任意登录用户,创建后 status=pending 待管理员审核)。
 *
 * 视频 / 封面需先在客户端直传 COS,本接口只提交 URL 与文案,
 * 业务校验(标题 / 简介长度、危险 HTML、课时上限)由后端复用教师后台同一份 schema。
 */
export function createCourse(input: CreateCourseInput) {
  return http.post<CreateCourseResult>(
    '/api/courses',
    input as unknown as Record<string, unknown>,
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
  return http.put<{ lessonId: string, positionSeconds: number, updatedAt: string }>(
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
  if (params?.limit !== undefined)
    query.limit = params.limit
  return http.get<RecentCourseListDTO>('/api/users/me/courses/recent', query)
}
