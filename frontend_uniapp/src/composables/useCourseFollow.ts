import { computed, ref } from 'vue'
import { followCourse, unfollowCourse } from '@/api/courses'
import { useFollowStore } from '@/store/follow'
import { useUserStore } from '@/store/user'
import { toLoginWithRedirect } from '@/utils/toLoginPage'

/**
 * 视频课程「关注 / 取消关注」交互(课程列表卡片、课程详情页与关注列表共用)。
 *
 * - 未登录:先引导登录并中断本次操作(不发请求、不弹业务错误);
 * - 请求中:按课程记录在途状态,按钮显示 loading 并阻止**同一课程**重复点击
 *   (不同课程可并行操作,不会互相吞掉点击);
 * - 方向显式:关注 / 取关由调用方选择 —— `toggle` 用于"切换"语义的按钮(详情页 / 课程卡片),
 *   `unfollow` 用于关注列表的「取消关注」按钮,不依赖本地关注态反推,
 *   避免本地状态失真时把"取消关注"执行成"关注";
 * - 成功后:写跨页 `useFollowStore`,课程详情 / 课程列表 / 关注列表同时同步;
 * - 失败:沿用 http 拦截器的统一 toast,本组合式不再二次提示业务错误。
 *
 * 说明:关注态读取一律走 store({@link isFollowed}),页面不另存本地状态,
 * 避免"详情页关注后返回列表仍是未关注"的跨页不一致。
 */
export function useCourseFollow() {
  const followStore = useFollowStore()
  const userStore = useUserStore()

  /** 在途课程集合:courseId → true(仅拦截同一课程的重复点击) */
  const loadingIds = ref<Record<string, true>>({})

  /** 对外保持单值契约(模板 `:loading="followLoadingId === course.id"` 无需改动) */
  const loadingId = computed(() => Object.keys(loadingIds.value)[0] ?? '')

  /** 指定课程是否正在请求(需要精确到课程时使用) */
  function isLoading(courseId: string) {
    return loadingIds.value[courseId] === true
  }

  /** 当前课程是否已关注(未登录 / 未知恒为 false) */
  function isFollowed(courseId: string) {
    return followStore.isCourseFollowed(courseId)
  }

  /**
   * 执行一次关注 / 取关(**方向由调用方显式给定**)。
   * @param action 'follow' 关注 / 'unfollow' 取关
   * @param courseId 课程 id
   * @returns 是否真正执行了请求(未登录 / 同一课程在途返回 false)
   */
  async function run(action: 'follow' | 'unfollow', courseId: string): Promise<boolean> {
    if (!courseId || isLoading(courseId))
      return false
    if (!userStore.isLoggedIn) {
      toLoginWithRedirect('navigateTo')
      return false
    }

    loadingIds.value[courseId] = true
    try {
      if (action === 'follow') {
        await followCourse(courseId)
        uni.showToast({ title: '关注成功', icon: 'success' })
      }
      else {
        await unfollowCourse(courseId)
        uni.showToast({ title: '已取消关注', icon: 'none' })
      }
      followStore.setCourseFollowed(courseId, action === 'follow')
      return true
    }
    catch {
      // 错误提示由 http 拦截器统一弹出(避免双重 toast);
      // 此处只负责"不写 store、不返回成功"
      return false
    }
    finally {
      delete loadingIds.value[courseId]
    }
  }

  /**
   * 切换关注态(详情页 / 课程列表卡片:按钮本身就是"切换"语义)。
   * @param courseId 课程 id
   */
  function toggle(courseId: string) {
    return run(isFollowed(courseId) ? 'unfollow' : 'follow', courseId)
  }

  /**
   * 取消关注(关注列表专用:方向固定,即使本地关注态失真也绝不会反向关注)。
   * @param courseId 课程 id
   */
  function unfollow(courseId: string) {
    return run('unfollow', courseId)
  }

  return { loadingId, isLoading, isFollowed, toggle, unfollow }
}
