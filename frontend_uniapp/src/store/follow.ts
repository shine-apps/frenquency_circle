import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 视频课程「关注态」跨页同步 store。
 *
 * 背景:关注按钮同时存在于课程详情、课程列表卡片与「我关注的视频」列表,
 * 若各页面各存一份本地状态,在详情页关注后返回列表会出现两态不一致。
 * 因此这里把「courseId → 是否已关注」收敛为单一数据源:
 * - 各页面拿到服务端下发的 `isFollowed` 后调用 {@link syncCourse} /
 *   {@link syncCourses} 回填(未登录时不回填,读取处默认 false);
 * - 关注 / 取关成功后调用 {@link setCourseFollowed} 立即生效,
 *   所有绑定本 store 的页面响应式同步;
 * - **不持久化**:跨会话缓存会与服务端漂移,状态一律以服务端下发为准。
 *
 * 竞态防护:列表页的请求可能在用户刚关注后才返回(携带旧值),
 * 故 `setCourseFollowed` 记录本地操作时间戳;回填时若传入 `requestedAt`
 * (请求发起前的时间戳)且早于本地操作时间,则跳过,避免"刚关注又被旧响应改回未关注"。
 */
export const useFollowStore = defineStore('course-follow', () => {
  /** 关注态:courseId → 是否已关注(仅存"已知"的课程) */
  const followedMap = ref<Record<string, boolean>>({})

  /** 本地操作时间:courseId → 最后一次用户主动关注 / 取关的时间戳(仅内存,不持久化) */
  const localActionAt = ref<Record<string, number>>({})

  /** 是否已关注(未知课程按未关注处理) */
  function isCourseFollowed(courseId: string) {
    return followedMap.value[courseId] === true
  }

  /**
   * 用服务端下发的 `isFollowed` 回填单门课程。
   * @param courseId    课程 id
   * @param followed    服务端下发的关注态
   * @param options.requestedAt 请求发起前的时间戳;传入时可避免过期响应覆盖本地新操作
   */
  function syncCourse(
    courseId: string,
    followed: boolean,
    options?: { requestedAt?: number },
  ) {
    if (!courseId)
      return
    const requestedAt = options?.requestedAt
    const actedAt = localActionAt.value[courseId]
    if (requestedAt !== undefined && actedAt !== undefined && actedAt > requestedAt)
      return
    followedMap.value[courseId] = followed
  }

  /** 批量回填(列表接口返回后调用) */
  function syncCourses(
    courses: { id: string, isFollowed: boolean }[],
    options?: { requestedAt?: number },
  ) {
    courses.forEach(course => syncCourse(course.id, course.isFollowed, options))
  }

  /**
   * 关注 / 取关成功后立即生效(并记录本地操作时间,防止过期响应回滚状态)。
   * 调用方应在接口成功后调用本方法,失败时不要调用。
   */
  function setCourseFollowed(courseId: string, followed: boolean) {
    if (!courseId)
      return
    localActionAt.value[courseId] = Date.now()
    followedMap.value[courseId] = followed
  }

  /** 清空关注态(退出登录 / 切换账号时调用,避免串号) */
  function clear() {
    followedMap.value = {}
    localActionAt.value = {}
  }

  return {
    followedMap,
    isCourseFollowed,
    syncCourse,
    syncCourses,
    setCourseFollowed,
    clear,
  }
})
