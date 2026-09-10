import { HOME_PAGE_PATH } from '@/router/config'
import { useSettingsStore } from '@/store/settings'

/**
 * 应用发布维护期(isAppDeploying 为 true)页面守卫。
 *
 * 用于创建活动 / 创建圈子 / 教师认证等发布类页面,避免同一段拦截逻辑在多个页面复制。
 *
 * - 设置拉取失败时放行(false),避免网络问题误伤正常用户;
 * - 命中维护期时提示并 reLaunch 回首页,返回 true,调用方需 `return` 终止后续逻辑。
 */
export async function shouldBlockForAppDeploying(): Promise<boolean> {
  const settingsStore = useSettingsStore()
  try {
    await settingsStore.getSettings()
  }
  catch { /* 拉取失败放行,不阻塞页面 */ }
  if (!settingsStore.isAppDeploying) {
    return false
  }
  // uni.showToast({ title: '应用发布维护中,功能暂不可用', icon: 'none' })
  uni.reLaunch({ url: HOME_PAGE_PATH })
  return true
}
