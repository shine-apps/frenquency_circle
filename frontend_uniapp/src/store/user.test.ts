import { fetchCurrentUser } from '@/api/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserStore } from './user'

vi.mock('@/api/auth', () => ({
  fetchCurrentUser: vi.fn(),
  fromUserDTO: vi.fn(),
}))

// fromUserDTO 真实实现的加载链为 @/api/auth → @/http/http → @/utils → pages.json,
// 而 pages.json 由 uni-pages 生成且含注释(非严格 JSON),vitest 下无法解析。
// 用桩替换 http 模块阻断该链路,使回归测试可以直接使用真实的映射函数。
vi.mock('@/http/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('useUserStore', () => {
  // 每个用例重置 mock,避免 mockResolvedValue / mockImplementationOnce 跨用例残留
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('初始状态：id 为空，未登录', () => {
    const store = useUserStore()
    expect(store.userInfo.id).toBe('')
    expect(store.isLoggedIn).toBe(false)
  })

  it('initUserSession：正确更新用户信息并补齐模板兼容字段', () => {
    const store = useUserStore()
    store.initUserSession({
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
    // 不再写入默认头像:avatar 与 avatarUrl 同源,无头像时由 UI 兜底展示昵称首字
    expect(store.userInfo.avatar).toBeUndefined()
  })

  it('initUserSession：未传头像时不写入默认头像', () => {
    const store = useUserStore()
    store.initUserSession({
      id: 'u2',
      name: '李四',
      email: 'lisi@example.com',
      role: 'TEACHER',
      tags: [],
    })
    expect(store.userInfo.avatar).toBeUndefined()
  })

  it('clearUserInfo：重置为初始状态', () => {
    const store = useUserStore()
    store.initUserSession({
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
    store.initUserSession({
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

  it('setProfile：后端资料写入后展示字段 avatar 与权威字段 avatarUrl 同步(回归)', async () => {
    const store = useUserStore()
    store.initUserSession({
      id: 'u1',
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'USER',
      tags: [],
    })

    // 使用真实的 fromUserDTO,验证 setProfile 收口映射后的字段同步
    const { fromUserDTO: mockedFromUserDTO } = await import('@/api/auth')
    const { fromUserDTO: realFromUserDTO } = await vi.importActual<typeof import('@/api/auth')>('@/api/auth')
    vi.mocked(mockedFromUserDTO).mockImplementationOnce(realFromUserDTO)

    store.setProfile({
      id: 'u1',
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'USER',
      avatarUrl: 'https://cdn.example.com/new-avatar.png',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    })

    expect(store.userInfo.avatarUrl).toBe('https://cdn.example.com/new-avatar.png')
    expect(store.userInfo.avatar).toBe('https://cdn.example.com/new-avatar.png')
  })

  it('setProfile：后端清除头像(null)时展示字段一并清空(回归)', async () => {
    const store = useUserStore()
    store.initUserSession({
      id: 'u1',
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'USER',
      tags: [],
      avatar: 'https://cdn.example.com/old-avatar.png',
    })

    const { fromUserDTO: mockedFromUserDTO } = await import('@/api/auth')
    const { fromUserDTO: realFromUserDTO } = await vi.importActual<typeof import('@/api/auth')>('@/api/auth')
    vi.mocked(mockedFromUserDTO).mockImplementationOnce(realFromUserDTO)

    store.setProfile({
      id: 'u1',
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'USER',
      avatarUrl: null,
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    })

    expect(store.userInfo.avatarUrl).toBeUndefined()
    expect(store.userInfo.avatar).toBeUndefined()
  })

  it('setProfile：完整 Profile 映射后 tags / address / location 同步更新', async () => {
    const store = useUserStore()
    const { fromUserDTO: mockedFromUserDTO } = await import('@/api/auth')
    const { fromUserDTO: realFromUserDTO } = await vi.importActual<typeof import('@/api/auth')>('@/api/auth')
    vi.mocked(mockedFromUserDTO).mockImplementationOnce(realFromUserDTO)

    store.setProfile({
      id: 'u1',
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'USER',
      tags: ['太极'],
      address: '杭州市西湖区',
      location: { latitude: 30.1, longitude: 120.2 },
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    })

    expect(store.userInfo.tags).toEqual(['太极'])
    expect(store.userInfo.address).toBe('杭州市西湖区')
    expect(store.userInfo.location?.latitude).toBe(30.1)
  })
})
