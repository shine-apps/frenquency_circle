import { beforeEach, describe, expect, it } from 'vitest'
import { useFollowStore } from '@/store/follow'

describe('store/follow 课程关注态跨页同步', () => {
  let store: ReturnType<typeof useFollowStore>

  beforeEach(() => {
    store = useFollowStore()
    store.clear()
  })

  it('未知课程按未关注处理', () => {
    expect(store.isCourseFollowed('course-1')).toBe(false)
  })

  it('syncCourse 用服务端下发的关注态回填', () => {
    store.syncCourse('course-1', true)
    expect(store.isCourseFollowed('course-1')).toBe(true)

    store.syncCourse('course-1', false)
    expect(store.isCourseFollowed('course-1')).toBe(false)
  })

  it('空 courseId 不写入(避免脏键)', () => {
    store.syncCourse('', true)
    expect(store.followedMap).toEqual({})
  })

  it('syncCourses 批量回填列表数据', () => {
    store.syncCourses([
      { id: 'course-1', isFollowed: true },
      { id: 'course-2', isFollowed: false },
    ])

    expect(store.isCourseFollowed('course-1')).toBe(true)
    expect(store.isCourseFollowed('course-2')).toBe(false)
  })

  it('setCourseFollowed 立即生效(详情页关注后列表同步)', () => {
    store.setCourseFollowed('course-1', true)
    expect(store.isCourseFollowed('course-1')).toBe(true)

    store.setCourseFollowed('course-1', false)
    expect(store.isCourseFollowed('course-1')).toBe(false)
  })

  it('过期响应不覆盖用户刚完成的关注操作', () => {
    // 请求在 10ms 前发出,用户在其后完成关注
    const requestedAt = Date.now() - 10
    store.setCourseFollowed('course-1', true)

    // 请求返回的是旧值 false,但 requestedAt 早于本地操作时间 → 跳过
    store.syncCourse('course-1', false, { requestedAt })
    expect(store.isCourseFollowed('course-1')).toBe(true)
  })

  it('未传 requestedAt 时仍按服务端数据覆盖(如关注页重拉)', () => {
    store.setCourseFollowed('course-1', true)

    store.syncCourse('course-1', false)
    expect(store.isCourseFollowed('course-1')).toBe(false)
  })

  it('clear 清空全部关注态(退出登录 / 切换账号)', () => {
    store.syncCourses([{ id: 'course-1', isFollowed: true }])
    store.clear()

    expect(store.followedMap).toEqual({})
    expect(store.isCourseFollowed('course-1')).toBe(false)
  })
})
