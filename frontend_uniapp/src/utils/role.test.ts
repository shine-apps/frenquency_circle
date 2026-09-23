import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canCreateCircle, canPublish, isTeacherRole } from './role'

/**
 * 发布权限判定单测。
 *
 * `isAppDeploying` 在测试环境(H5 编译分支)恒为 false,这里用可变桩模拟维护期,
 * 覆盖「维护期一律禁止发布」这一唯一否定条件。
 */
const { deployingFlag } = vi.hoisted(() => ({ deployingFlag: { value: false } }))

vi.mock('@/store/settings', () => ({
  useSettingsStore: () => ({
    get isAppDeploying() {
      return deployingFlag.value
    },
  }),
}))

beforeEach(() => {
  deployingFlag.value = false
})

describe('isTeacherRole', () => {
  it('教师区角色包含 TEACHER 与 ADMIN', () => {
    expect(isTeacherRole('TEACHER')).toBe(true)
    expect(isTeacherRole('ADMIN')).toBe(true)
  })

  it('普通用户与空角色不是教师区角色', () => {
    expect(isTeacherRole('USER')).toBe(false)
    expect(isTeacherRole(undefined)).toBe(false)
    expect(isTeacherRole(null)).toBe(false)
  })
})

describe('canPublish', () => {
  it('任意已登录角色均可发布(USER / TEACHER / ADMIN)', () => {
    expect(canPublish('USER')).toBe(true)
    expect(canPublish('TEACHER')).toBe(true)
    expect(canPublish('ADMIN')).toBe(true)
  })

  it('未登录(角色缺失)不可发布', () => {
    expect(canPublish(undefined)).toBe(false)
    expect(canPublish(null)).toBe(false)
  })

  it('应用发布维护中一律不可发布', () => {
    deployingFlag.value = true
    expect(canPublish('USER')).toBe(false)
    expect(canPublish('TEACHER')).toBe(false)
    expect(canPublish('ADMIN')).toBe(false)
  })
})

describe('canCreateCircle', () => {
  it('为 canPublish 的兼容别名(圈子 / 活动 / 课程同一口径)', () => {
    expect(canCreateCircle).toBe(canPublish)
    expect(canCreateCircle('USER')).toBe(true)
  })
})
