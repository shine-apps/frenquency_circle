import { tabbarStore } from '@/tabbar/store'

/** 兼容 App.vue 中 uni-app 运行时注入的 $router 的最小类型 */
interface MiniRouter {
  beforeEach: (guard: (to: { path: string }, from: unknown, next: () => void) => void) => void
}

export const permission = {
  install(router: MiniRouter) {
    router.beforeEach((to, _from, next) => {
      tabbarStore.setAutoCurIdx(to.path)
      next()
    })
  },
}
