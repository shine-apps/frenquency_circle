import { getMyProfile, updateMyTags, updateProfile } from '@/api/auth'
import { useUserStore } from '@/store/user'
import type { UserProfile } from '@/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreGuestProfile, saveGuestLocation, saveGuestTags } from './guest-profile'

vi.mock('@/api/auth', () => ({
  // userStore 也依赖这两个导出,缺一会导致 mock 模块导出缺失报错
  fetchCurrentUser: vi.fn(),
  fromUserDTO: vi.fn(),
  getMyProfile: vi.fn(),
  updateMyTags: vi.fn(),
  updateProfile: vi.fn(),
}))

/** 内存版 storage,让 save → restore 走真实往返,同时便于断言"已清除" */
const storage = new Map<string, unknown>()

/** 与模块内部保持一致,用于构造脏数据场景 */
const TAGS_KEY = 'guest_tags'
const LOCATION_KEY = 'guest_location'

/** 构造一份完整资料返回值(默认:未设置兴趣与位置) */
function makeProfile(patch: Record<string, unknown> = {}): UserProfile {
  return {
    id: 'u1',
    email: 'a@b.com',
    name: '张三',
    role: 'USER',
    tags: [],
    location: null,
    address: null,
    privacySettings: { allowMatch: true, publicContact: true, locationPrecision: 'exact' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

describe('utils/guest-profile', () => {
  beforeEach(() => {
    storage.clear()
    vi.mocked(uni.getStorageSync).mockImplementation((key: string) => (storage.has(key) ? storage.get(key) : null) as never)
    vi.mocked(uni.setStorageSync).mockImplementation(((key: string, value: unknown) => {
      storage.set(key, value)
    }) as never)
    vi.mocked(uni.removeStorageSync).mockImplementation(((key: string) => {
      storage.delete(key)
    }) as never)

    vi.mocked(getMyProfile).mockResolvedValue(makeProfile())
    vi.mocked(updateMyTags).mockImplementation(async (tags: string[]) => tags)
    vi.mocked(updateProfile).mockResolvedValue(makeProfile())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('无暂存数据时不发起任何请求,也不清理缓存', async () => {
    await restoreGuestProfile()

    expect(getMyProfile).not.toHaveBeenCalled()
    expect(updateMyTags).not.toHaveBeenCalled()
    expect(updateProfile).not.toHaveBeenCalled()
    expect(uni.removeStorageSync).not.toHaveBeenCalled()
  })

  it('兴趣为空数组时不写入缓存', async () => {
    saveGuestTags([])
    await restoreGuestProfile()

    expect(getMyProfile).not.toHaveBeenCalled()
  })

  it('账号无兴趣时,把暂存的兴趣写入账号并清除缓存', async () => {
    saveGuestTags(['古筝', '书法'])

    await restoreGuestProfile()

    expect(updateMyTags).toHaveBeenCalledWith(['古筝', '书法'])
    // 未暂存位置,不应触发资料更新
    expect(updateProfile).not.toHaveBeenCalled()
    expect(useUserStore().userInfo.tags).toEqual(['古筝', '书法'])
    expect(storage.size).toBe(0)
  })

  it('账号无位置时,把暂存的位置写入账号并清除缓存', async () => {
    saveGuestLocation({ latitude: 30.5, longitude: 114.3, address: '武汉市洪山区' })

    await restoreGuestProfile()

    expect(updateProfile).toHaveBeenCalledWith({
      address: '武汉市洪山区',
      latitude: 30.5,
      longitude: 114.3,
    })
    // 未暂存兴趣,不应触发标签更新
    expect(updateMyTags).not.toHaveBeenCalled()
    expect(storage.size).toBe(0)
  })

  it('暂存的位置写入后同步到 store(接口无返回时回退到本地值)', async () => {
    saveGuestLocation({ latitude: 30.5, longitude: 114.3, address: '武汉市洪山区' })
    // 接口返回 location 为 null,验证回退逻辑
    vi.mocked(updateProfile).mockResolvedValue(makeProfile({ location: null, address: null }))

    await restoreGuestProfile()

    const store = useUserStore()
    expect(store.userInfo.location).toEqual({ latitude: 30.5, longitude: 114.3 })
    expect(store.userInfo.address).toBe('武汉市洪山区')
  })

  it('账号已有兴趣与位置时不覆盖,仅清除缓存', async () => {
    saveGuestTags(['古筝'])
    saveGuestLocation({ latitude: 30.5, longitude: 114.3, address: '武汉市' })
    vi.mocked(getMyProfile).mockResolvedValue(makeProfile({
      tags: ['太极'],
      location: { latitude: 1, longitude: 2 },
      address: '北京市',
    }))

    await restoreGuestProfile()

    expect(updateMyTags).not.toHaveBeenCalled()
    expect(updateProfile).not.toHaveBeenCalled()
    expect(storage.size).toBe(0)
  })

  it('账号只缺其中一项时,仅回填缺失的那一项', async () => {
    saveGuestTags(['古筝'])
    saveGuestLocation({ latitude: 30.5, longitude: 114.3, address: '武汉市' })
    // 账号已有兴趣,但没有位置
    vi.mocked(getMyProfile).mockResolvedValue(makeProfile({ tags: ['太极'] }))

    await restoreGuestProfile()

    expect(updateMyTags).not.toHaveBeenCalled()
    expect(updateProfile).toHaveBeenCalledTimes(1)
  })

  it('暂存数据格式异常时视为无缓存,不发起请求', async () => {
    storage.set(TAGS_KEY, 'not-an-array')
    storage.set(LOCATION_KEY, { latitude: 'x', longitude: 'y' })

    await restoreGuestProfile()

    expect(getMyProfile).not.toHaveBeenCalled()
    expect(updateMyTags).not.toHaveBeenCalled()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('回填过程失败时保留缓存且不向上抛错', async () => {
    saveGuestTags(['古筝'])
    vi.mocked(getMyProfile).mockRejectedValue(new Error('network down'))

    await expect(restoreGuestProfile()).resolves.toBeUndefined()
    expect(uni.removeStorageSync).not.toHaveBeenCalled()
  })

  it('写入兴趣失败时保留缓存且不向上抛错', async () => {
    saveGuestTags(['古筝'])
    vi.mocked(updateMyTags).mockRejectedValue(new Error('tags save failed'))

    await expect(restoreGuestProfile()).resolves.toBeUndefined()
    expect(uni.removeStorageSync).not.toHaveBeenCalled()
  })
})
