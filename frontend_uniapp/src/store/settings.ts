import type { SystemSetting } from '@/types'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchSettings } from '@/api/settings'

/** 设置缓存有效期:10 分钟 */
const CACHE_TTL = 10 * 60 * 1000

/**
 * 系统设置 store。
 *
 * - 应用启动时(App.vue onLaunch)调用一次 getSettings;
 * - 缓存 10 分钟,未过期直接返回,过期后自动重新拉取;
 * - 不持久化,每次冷启动都会重新获取(符合"启动时获取一次"的语义)。
 */
export const useSettingsStore = defineStore('settings', () => {
  /** 系统设置列表(空数组表示尚未拉取或后端无设置项) */
  const settings = ref<SystemSetting[]>([])
  /** 最近一次成功拉取的时间戳(0 表示尚未拉取) */
  const fetchedAt = ref(0)

  /**
   * 获取系统设置。
   * - 缓存未过期时直接返回缓存;
   * - 过期或强制刷新时重新请求并更新 fetchedAt;
   * - 空结果同样计入缓存,避免 TTL 内重复请求。
   */
  async function getSettings(force = false): Promise<SystemSetting[]> {
    const now = Date.now()
    const fresh = fetchedAt.value > 0 && now - fetchedAt.value < CACHE_TTL
    if (!force && fresh) {
      return settings.value
    }
    const list = await fetchSettings()
    settings.value = list
    fetchedAt.value = now
    return list
  }

  /** 按 key 获取设置项 value(未命中返回 undefined)。支持泛型做类型断言 */
  function getSetting<T = unknown>(key: string): T | undefined {
    return settings.value.find(s => s.key === key)?.value as T | undefined
  }

  return {
    settings,
    fetchedAt,
    getSettings,
    getSetting,
  }
})
