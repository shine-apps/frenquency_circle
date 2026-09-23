import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCourseFollow } from '@/composables/useCourseFollow'
import { useFollowStore } from '@/store/follow'

/**
 * useCourseFollow 单测。
 *
 * 重点锁定两条易回归的契约:
 * 1. `unfollow` 的方向固定 —— 即使本地关注态失真(store 为 false),
 *    点「取消关注」也绝不能反向执行"关注"(否则会给作者发出一条错误通知);
 * 2. 在途去重按课程粒度 —— 同一课程重复点击被拦截,不同课程可并行操作。
 */

const { followCourseMock, unfollowCourseMock, toLoginMock, userStoreStub } = vi.hoisted(() => ({
  followCourseMock: vi.fn(),
  unfollowCourseMock: vi.fn(),
  toLoginMock: vi.fn(),
  userStoreStub: { isLoggedIn: true },
}))

vi.mock('@/api/courses', () => ({
  followCourse: followCourseMock,
  unfollowCourse: unfollowCourseMock,
}))

vi.mock('@/store/user', () => ({
  useUserStore: () => userStoreStub,
}))

vi.mock('@/utils/toLoginPage', () => ({
  toLoginWithRedirect: toLoginMock,
}))

beforeEach(() => {
  userStoreStub.isLoggedIn = true
  followCourseMock.mockResolvedValue({ followed: true })
  unfollowCourseMock.mockResolvedValue({ followed: false })
})

describe('useCourseFollow', () => {
  it('unfollow 方向固定:本地关注态失真时仍只调取关接口', async () => {
    const { unfollow, isFollowed } = useCourseFollow()
    // 模拟失真:store 认为未关注,但页面上该项本就是"已关注"列表项
    expect(isFollowed('course-1')).toBe(false)

    const ok = await unfollow('course-1')

    expect(ok).toBe(true)
    expect(unfollowCourseMock).toHaveBeenCalledTimes(1)
    expect(unfollowCourseMock).toHaveBeenCalledWith('course-1')
    expect(followCourseMock).not.toHaveBeenCalled()
  })

  it('toggle 依据当前关注态选择方向', async () => {
    const { toggle } = useCourseFollow()
    const followStore = useFollowStore()

    await toggle('course-1')
    expect(followCourseMock).toHaveBeenCalledWith('course-1')

    followStore.setCourseFollowed('course-1', true)
    await toggle('course-1')
    expect(unfollowCourseMock).toHaveBeenCalledWith('course-1')
  })

  it('成功后写入跨页 store,失败时不写', async () => {
    const { toggle } = useCourseFollow()
    const followStore = useFollowStore()

    await toggle('course-1')
    expect(followStore.isCourseFollowed('course-1')).toBe(true)

    unfollowCourseMock.mockRejectedValueOnce(new Error('boom'))
    await toggle('course-1')
    // 失败保持原状态(不在本地假设服务端已变更)
    expect(followStore.isCourseFollowed('course-1')).toBe(true)
  })

  it('同一课程在途时拦截重复点击,不同课程可并行', async () => {
    const { toggle, loadingId } = useCourseFollow()
    let release: () => void = () => {}
    followCourseMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        release = () => resolve()
      }),
    )

    const pending = toggle('course-1')
    expect(loadingId.value).toBe('course-1')

    // 另一门课程不受影响(旧实现会因全局单值 loadingId 被静默丢弃)
    await expect(toggle('course-2')).resolves.toBe(true)
    expect(followCourseMock).toHaveBeenCalledTimes(2)

    // 同一门课程重复点击被拦截,不再发请求
    await expect(toggle('course-1')).resolves.toBe(false)
    expect(followCourseMock).toHaveBeenCalledTimes(2)

    release()
    await expect(pending).resolves.toBe(true)
    expect(loadingId.value).toBe('')
  })

  it('未登录时引导登录且不发请求', async () => {
    userStoreStub.isLoggedIn = false
    const { unfollow } = useCourseFollow()

    await expect(unfollow('course-1')).resolves.toBe(false)

    expect(toLoginMock).toHaveBeenCalledTimes(1)
    expect(unfollowCourseMock).not.toHaveBeenCalled()
  })

  it('空 courseId 直接忽略', async () => {
    const { toggle } = useCourseFollow()

    await expect(toggle('')).resolves.toBe(false)
    expect(followCourseMock).not.toHaveBeenCalled()
  })
})
