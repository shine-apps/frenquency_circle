import { getMyProfile, updateMyTags, updateProfile } from '@/api/auth'
import { useUserStore } from '@/store/user'

/** 未登录时暂存的兴趣标签存储 key */
const GUEST_TAGS_KEY = 'guest_tags'

/** 未登录时暂存的位置存储 key */
const GUEST_LOCATION_KEY = 'guest_location'

/** 未登录时暂存的位置(经纬度 + 逆地理地址) */
export interface GuestLocation {
  latitude: number
  longitude: number
  address: string
}

/**
 * 暂存未登录用户选择的兴趣标签。
 * 空数组视为"未选择",直接清除缓存,避免留下无效条目。
 */
export function saveGuestTags(tags: string[]): void {
  if (tags.length === 0) {
    uni.removeStorageSync(GUEST_TAGS_KEY)
    return
  }
  uni.setStorageSync(GUEST_TAGS_KEY, tags)
}

/** 暂存未登录用户选择的位置(经纬度 + 地址) */
export function saveGuestLocation(loc: GuestLocation): void {
  uni.setStorageSync(GUEST_LOCATION_KEY, loc)
}

/** 读取暂存的兴趣标签;无缓存或数据异常时返回空数组 */
function readGuestTags(): string[] {
  try {
    const stored = uni.getStorageSync(GUEST_TAGS_KEY)
    if (!Array.isArray(stored))
      return []
    return stored.filter((item): item is string => typeof item === 'string')
  }
  catch {
    return []
  }
}

/** 读取暂存的位置;无缓存或数据异常时返回 null */
function readGuestLocation(): GuestLocation | null {
  try {
    const stored = uni.getStorageSync(GUEST_LOCATION_KEY)
    if (!stored || typeof stored !== 'object')
      return null
    const { latitude, longitude, address } = stored as Partial<GuestLocation>
    if (typeof latitude !== 'number' || typeof longitude !== 'number')
      return null
    return {
      latitude,
      longitude,
      address: typeof address === 'string' ? address : '',
    }
  }
  catch {
    return null
  }
}

/** 清除暂存的兴趣与位置 */
function clearGuestProfile(): void {
  uni.removeStorageSync(GUEST_TAGS_KEY)
  uni.removeStorageSync(GUEST_LOCATION_KEY)
}

/**
 * 登录成功后,把未登录时暂存的兴趣与位置回填到当前账号。
 *
 * 设计要点:
 * - 本地无暂存数据直接返回,不产生额外网络请求(老用户登录零开销);
 * - 是否已设置以 `getMyProfile()` 返回的完整资料为准,因为
 *   `fetchUserInfo()` 经 `fromUserDTO` 会丢弃 tags/location,不能作为判断依据;
 * - 逐字段独立判断,仅在该字段尚未设置时写入,绝不覆盖账号已有数据;
 * - 整体 try/catch,失败保留缓存(下次登录可重试)且不阻断登录流程。
 */
export async function restoreGuestProfile(): Promise<void> {
  const tags = readGuestTags()
  const location = readGuestLocation()
  if (tags.length === 0 && !location)
    return

  try {
    const profile = await getMyProfile()
    const userStore = useUserStore()
    const hasTags = Array.isArray(profile.tags) && profile.tags.length > 0
    const hasLocation = !!profile.location

    // 兴趣:仅当账号尚未设置且本地有暂存时写入
    if (!hasTags && tags.length > 0) {
      const saved = await updateMyTags(tags)
      userStore.setTags(saved)
    }

    // 位置:仅当账号尚未设置且本地有暂存时写入
    if (!hasLocation && location) {
      const updated = await updateProfile({
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
      })
      userStore.setLocation(
        updated.location ?? { latitude: location.latitude, longitude: location.longitude },
        updated.address ?? location.address,
      )
    }

    clearGuestProfile()
  }
  catch (e) {
    console.warn('[guest-profile] restore failed:', e)
  }
}
