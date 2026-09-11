import { HOME_PAGE_PATH } from '@/router/config'
import { useMatchStore } from '@/store/match'

/**
 * 携带兴趣标签跳转到首页匹配。
 *
 * 首页 /pages/index/index 是自定义 tabBar 页,`uni.switchTab` 不支持 query 参数,
 * 因此标签经 `matchStore.pendingTags` 跨页传递,由首页 onShow 消费一次后
 * 写入筛选条件并重新匹配"同趣的人 / 同趣的圈子"。
 *
 * 部分端上 switchTab 可能失败,兜底用 reLaunch 打开首页,保证入口不失效。
 */
export function goHomeMatchWithTags(tags: string[]): void {
  const matchStore = useMatchStore()
  matchStore.setPendingTags(tags)
  uni.switchTab({
    url: HOME_PAGE_PATH,
    fail: () => uni.reLaunch({ url: HOME_PAGE_PATH }),
  })
}
