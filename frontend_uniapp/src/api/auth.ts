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
 * 将后端 UserDTO 映射为前端 UserInfo 局部更新。
 * 用于 `useUserStore.updateUser` 入参:
 * - `avatar` 字段沿用旧语义(头像展示)
 * - `avatarUrl` 字段保留(后端原值,便于后续编辑页回填)
 * - `phone` 从最新 email 重算(避免邮箱变更后残留旧手机号)
 */
export function fromUserDTO(dto: UserDTO): Partial<UserInfo> {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.role,
    phone: extractPhone(dto.email),
    avatar: dto.avatarUrl ?? undefined,
    avatarUrl: dto.avatarUrl ?? undefined,
  }
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
 * - `allowMatch=false` 时该用户不出现在他人的"同频的人"匹配结果
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
