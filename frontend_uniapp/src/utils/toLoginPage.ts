import { getLastPage } from '@/utils'
import { debounce } from '@/utils/debounce'
import { LOGIN_PAGE } from '@/router/config'

interface ToLoginPageOptions {
  /**
   * 跳转模式, uni.navigateTo | uni.reLaunch
   * @default 'navigateTo'
   */
  mode?: 'navigateTo' | 'reLaunch'
  /**
   * 查询参数
   * @example '?redirect=/pages/home/index'
   */
  queryString?: string
}

/**
 * 跳转到登录页, 带防抖处理
 *
 * 如果要立即跳转，不做延时，可以使用 `toLoginPage.flush()` 方法
 */
export const toLoginPage = debounce((options: ToLoginPageOptions = {}) => {
  const { mode = 'navigateTo', queryString = '' } = options

  const url = `${LOGIN_PAGE}${queryString}`

  // 获取当前页面路径
  const currentPage = getLastPage()
  const currentPath = `/${currentPage.route}`
  // 如果已经在登录页，则不跳转
  if (currentPath === LOGIN_PAGE) {
    return
  }

  if (mode === 'navigateTo') {
    uni.navigateTo({ url })
  }
  else {
    uni.reLaunch({ url })
  }
}, 500)

/**
 * 未登录时跳转登录页, 携带当前页 fullPath 作为 redirect 参数, 登录后回到当前页。
 *
 * 默认 reLaunch 清空页面栈(与登录成功后的 reLaunch 行为一致), 避免 navigateTo 导致登录后返回时残留未登录的旧页面。
 */
export function toLoginWithRedirect(mode: 'navigateTo' | 'reLaunch' = 'reLaunch') {
  const lastPage = getLastPage()
  if (!lastPage) {
    if (mode === 'navigateTo')
      uni.navigateTo({ url: LOGIN_PAGE })
    else
      uni.reLaunch({ url: LOGIN_PAGE })
    return
  }
  const currentPath = `/${lastPage.route}`
  // 如果已经在登录页，则不跳转
  if (currentPath === LOGIN_PAGE) {
    return
  }
  const fullPath = lastPage.$page?.fullPath || currentPath
  const url = `${LOGIN_PAGE}?redirect=${encodeURIComponent(fullPath)}`
  if (mode === 'navigateTo') {
    uni.navigateTo({ url })
  }
  else {
    uni.reLaunch({ url })
  }
}
