import { fetchCurrentUser } from '@/api/auth'
import { describe, expect, it, vi } from 'vitest'
import { useUserStore } from './user'

vi.mock('@/api/auth', () => ({
  fetchCurrentUser: vi.fn(),
  fromUserDTO: vi.fn(),
}))

describe('useUserStore', () => {
  it('初始状态：id 为空，未登录', () => {
    const store = useUserStore()
    expect(store.userInfo.id).toBe('')
    expect(store.isLoggedIn).toBe(false)
  })

  it('setUserInfo：正确更新用户信息并补齐模板兼容字段', () => {
    const store = useUserStore()
    store.setUserInfo({
      id: 'u1',
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'USER',
      tags: [],
    })
    expect(store.userInfo.id).toBe('u1')
    expect(store.userInfo.name).toBe('张三')
    expect(store.userInfo.username).toBe('zhangsan@example.com')
    expect(store.userInfo.nickname).toBe('张三')
    expect(store.userInfo.roles).toEqual(['USER'])
    expect(store.userInfo.avatar).toBe('/static/images/default-avatar.png')
  })

  it('setUserInfo：avatar 为空时使用默认头像', () => {
    const store = useUserStore()
    store.setUserInfo({
      id: 'u2',
      name: '李四',
      email: 'lisi@example.com',
      role: 'TEACHER',
      tags: [],
    })
    expect(store.userInfo.avatar).toBe('/static/images/default-avatar.png')
  })

  it('setUserAvatar：正确更新头像', () => {
    const store = useUserStore()
    store.setUserAvatar('https://example.com/new-avatar.png')
    expect(store.userInfo.avatar).toBe('https://example.com/new-avatar.png')
  })

  it('clearUserInfo：重置为初始状态', () => {
    const store = useUserStore()
    store.setUserInfo({
      id: 'u1',
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'USER',
      tags: [],
    })
    store.clearUserInfo()
    expect(store.userInfo.id).toBe('')
    expect(store.isLoggedIn).toBe(false)
  })

  it('setTags：更新兴趣标签', () => {
    const store = useUserStore()
    store.setUserInfo({
      id: 'u1',
      name: '张三',
      email: 'a@b.com',
      role: 'USER',
      tags: [],
    })
    store.setTags(['古筝'])
    expect(store.userInfo.tags).toHaveLength(1)
    expect(store.userInfo.tags[0]).toBe('古筝')
  })

  it('setLocation：更新位置与地址', () => {
    const store = useUserStore()
    store.setLocation({ latitude: 30.1, longitude: 120.2 }, '杭州市西湖区')
    expect(store.userInfo.location?.latitude).toBe(30.1)
    expect(store.userInfo.address).toBe('杭州市西湖区')
  })

  it('fetchUserInfo：调用 API 并将结果写入 store', async () => {
    const store = useUserStore()
    const mockUser = {
      id: 'u42',
      name: 'API User',
      email: 'api@x.com',
      role: 'USER' as const,
      avatarUrl: 'https://x.com/a.png',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    }
    vi.mocked(fetchCurrentUser).mockResolvedValue(mockUser)
    // fromUserDTO 映射结果
    const { fromUserDTO } = await import('@/api/auth')
    vi.mocked(fromUserDTO).mockReturnValue({
      id: 'u42',
      name: 'API User',
      email: 'api@x.com',
      role: 'USER',
      avatar: 'https://x.com/a.png',
      avatarUrl: 'https://x.com/a.png',
    })

    await store.fetchUserInfo()

    expect(store.userInfo.id).toBe('u42')
    expect(store.userInfo.name).toBe('API User')
    expect(store.userInfo.avatar).toBe('https://x.com/a.png')
  })
})
