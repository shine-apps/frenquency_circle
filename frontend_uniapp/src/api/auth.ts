import type { UpdateMyProfileInput, UpdateProfileInput, UserDTO } from './types/login'
import { http } from '@/http/http'
import type { PrivacySettings, UserProfile } from '@/types'
import type { UserInfo } from '@/store/user'

/**
 * 从 email 中提取手机号。
 * 手机号登录用户的 email 形如 `13800138000@phonedomain.com`;非此格式返回 undefined。
 */
function extractPhone(email: string): string | undefined {
  const m = /^(\d{11})@/.exec(email)
  return m ? m[1] : undefined
}

/**
 * 将 AuthUser 映射为前端 UserInfo。
 * 手机号登录用户的 email 形如 `13800138000@phonedomain.com`,从中提取手机号。
 * 登录响应不含 tags,默认空数组;后续由 `getMyProfile` 填充。
 */
export function toUserInfo(auth: { id: string, email: string, name: string, role: string }): Partial<UserInfo> {
  return {
    id: auth.id,
    name: auth.name,
    email: auth.email,
    role: auth.role as UserInfo['role'],
    phone: extractPhone(auth.email),
    tags: [],
  }
}

/**
 * 将后端用户资料映射为前端 UserInfo 局部更新。
 *
 * 这是「后端 DTO → 内部模型」的唯一映射入口:所有资料写入(store 的
 * `fetchUserInfo` / `setProfile`)都必须经过它,以保证:
 * - `avatar` 展示字段与 `avatarUrl` 权威字段始终同步,避免改了头像但 UI 停留旧值
 * - `phone` 优先取后端绑定值,缺失时回退为从 email 提取
 * - 完整资料(UserProfile)附带的 tags / address / location 等业务字段一并映射
 *   (按字段存在性判断,后端未返回的字段保持本地值不变,不会被 undefined 覆盖)
 */
export function fromUserDTO(dto: UserDTO | UserProfile): Partial<UserInfo> {
  const patch: Partial<UserInfo> = {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.role,
    phone: extractPhone(dto.email),
  }
  // 可空字段统一按"后端是否返回该键"写入,未返回则保持本地值,
  // 避免部分响应静默清空本地已保存的数据
  if ('wechat' in dto)
    patch.wechat = dto.wechat ?? null
  if ('gender' in dto)
    patch.gender = dto.gender ?? null
  if ('birthday' in dto)
    patch.birthday = dto.birthday ?? null
  if ('avatarUrl' in dto) {
    // 头像双字段必须在同一处同步,防止只更新 avatarUrl 而 avatar 停留在旧值
    patch.avatar = dto.avatarUrl ?? undefined
    patch.avatarUrl = dto.avatarUrl ?? undefined
  }
  // 以下为完整资料(UserProfile)才包含的业务字段,逐一按存在性映射
  if ('phone' in dto && dto.phone)
    patch.phone = dto.phone
  if ('tags' in dto)
    patch.tags = dto.tags
  if ('practiceYears' in dto)
    patch.practiceYears = dto.practiceYears ?? null
  if ('activityLevel' in dto)
    patch.activityLevel = dto.activityLevel ?? undefined
  if ('privacySettings' in dto)
    patch.privacySettings = dto.privacySettings ?? undefined
  if ('location' in dto)
    patch.location = dto.location ?? null
  if ('address' in dto)
    patch.address = dto.address ?? null
  return patch
}

/** 获取当前登录用户(校验 token + 刷新用户信息) */
export function fetchCurrentUser() {
  return http.get<UserDTO>('/api/auth/me')
}

/** 更新当前登录用户自己的资料(昵称 / 邮箱 / 头像 URL) */
export function updateMyProfile(patch: UpdateMyProfileInput) {
  return http.patch<UserDTO>('/api/auth/me', { ...patch })
}

/**
 * 获取当前登录用户的完整资料(含 tags / privacySettings / 业务字段)。
 * - 走 `GET /api/auth/me`,后端返回 UserProfileDTO
 * - 与 `fetchCurrentUser` 区别:后者返回 UserDTO(无 tags),仅用于 token 校验;
 *   本函数用于需要完整资料的页面(个人中心、隐私设置等)
 */
export function getMyProfile() {
  return http.get<UserProfile>('/api/auth/me')
}

/**
 * 全量替换当前用户的兴趣标签(名称数组)。
 * - PUT /api/users/me/hobby-tags
 * - 后端 zod 校验 `tags: string[](1-10 项名称)`
 *
 * @param tags 标签名称列表(1-10 个,存 hobby_tags.name)
 * @returns 更新后的标签名称数组
 */
export async function updateMyTags(tags: string[]): Promise<string[]> {
  const res = await http.put<{ tags: string[] }>('/api/users/me/hobby-tags', { tags })
  return res.tags
}

/**
 * 更新当前用户的隐私设置。
 * - PUT /api/users/me/privacy
 * - `allowMatch=false` 时该用户不出现在他人的"同趣的人"匹配结果
 *
 * @param settings 隐私设置
 * @returns 后端实际持久化的 PrivacySettings
 */
export async function updatePrivacy(settings: PrivacySettings): Promise<PrivacySettings> {
  const res = await http.put<{ privacySettings: PrivacySettings }>('/api/users/me/privacy', { ...settings })
  return res.privacySettings
}

/**
 * 更新当前用户的业务资料(role / phone / practiceYears / activityLevel)。
 * - PATCH /api/users/me/profile
 *
 * @param patch 业务字段(至少传 1 个)
 * @returns 更新后的 UserProfile
 */
export function updateProfile(patch: UpdateProfileInput) {
  return http.patch<UserProfile>('/api/users/me/profile', { ...patch })
}

/**
 * 通过短信验证码绑定/更换当前用户的手机号。
 * - POST /api/users/me/phone/verify
 * - 需先调用 `sendSmsCode(phone)` 发送验证码到目标手机号
 *
 * @param phone 目标手机号(11 位)
 * @param code 6 位短信验证码
 * @returns 更新后的 UserProfile(phone 已为新号码)
 */
export function verifyPhoneBind(phone: string, code: string) {
  return http.post<UserProfile>('/api/users/me/phone/verify', {
    phone,
    code,
  })
}
