import { onMounted, onUnmounted, toValue, watch } from 'vue'
import type { Ref } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { http } from '@/http/http'

/**
 * useShare - 统一分享 Composable
 *
 * - 小程序(MP-WEIXIN):返回 shareAppMessage(好友)/shareTimeline(朋友圈)分享数据,
 *   内容在用户点击转发时才读取最新值,支持异步加载的数据。
 *   注意:微信小程序编译器只收集页面 <script setup> 顶层直接调用的分享钩子,
 *   因此页面必须自行在顶层调用 onShareAppMessage / onShareTimeline 完成注册。
 * - H5(微信浏览器):整个 SPA 生命周期内只 wx.config 一次(全局单例),config
 *   成功后由「当前置顶页」调用 updateAppMessageShareData / updateTimelineShareData
 *   写入分享卡片;分享出去的 link 是当前页完整 URL(含 hash 路由与 query),
 *   后端 JSSDK 签名仍使用去除 # 之后的 URL。非微信浏览器或未配置公众号时静默
 *   降级,不影响页面。
 *
 * 用法:
 *   const { share, shareAppMessage, shareTimeline } = useShare({
 *     title: () => circle.value?.title || '趣邻圈',
 *     path: '/pages/circle/circle',
 *     query: () => ({ id: circleId.value }),
 *     imageUrl: () => circle.value?.coverImages?.[0],
 *   })
 *
 *   // 小程序端必须在页面顶层注册(编译器静态收集):
 *   // #ifdef MP-WEIXIN
 *   onShareAppMessage(shareAppMessage)
 *   onShareTimeline(shareTimeline)
 *   // #endif
 */

type MaybeRefOrGetter<T> = T | Ref<T> | (() => T)

export interface UseShareOptions {
  title: MaybeRefOrGetter<string>
  /** 小程序绝对路径, 如 /pages/circle/circle */
  path?: MaybeRefOrGetter<string>
  /** 小程序分享 query(键值对, 由内部拼接到 path / 朋友圈 query) */
  query?: MaybeRefOrGetter<Record<string, string>>
  imageUrl?: MaybeRefOrGetter<string>
  /** H5 好友分享描述(朋友圈卡片仅展示 title + 图片) */
  desc?: MaybeRefOrGetter<string>
}

/**
 * 分享默认兜底图:调用方未传 imageUrl(或为空)时使用。
 * MP-WEIXIN 端使用 uni-app 本地代码包路径(/static 开头);
 * H5 端 JSSDK 的 imgUrl 必须是绝对 http(s) URL,由运行时按
 * `window.location.origin + 部署根路径(BASE_URL)` 拼接。
 */
const DEFAULT_SHARE_IMAGE_PATH = '/static/images/logo.png'

/** H5 微信 JSSDK 最小类型声明(jweixin 为动态加载, 无 npm 包类型) */
interface WxJsSdk {
  config: (options: {
    debug?: boolean
    appId: string
    timestamp: number
    nonceStr: string
    signature: string
    jsApiList: string[]
  }) => void
  ready: (callback: () => void) => void
  error: (callback: (res: { errMsg: string }) => void) => void
  checkJsApi: (options: { jsApiList: string[] }) => void
  updateAppMessageShareData: (options: { title: string, desc?: string, link: string, imgUrl?: string }) => void
  updateTimelineShareData: (options: { title: string, link: string, imgUrl?: string }) => void
}

declare global {
  interface Window { wx?: WxJsSdk }
}

/** 是否微信内置浏览器 */
const isWeChatBrowser = typeof window !== 'undefined' && /micromessenger/i.test(navigator.userAgent)

const WX_JSSDK_URL = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js'
let wxSdkPromise: Promise<WxJsSdk | null> | null = null

/** 按需加载 jweixin 并缓存 Promise, 避免重复插入 script */
function loadWxJsSdk(): Promise<WxJsSdk | null> {
  if (typeof window === 'undefined' || !isWeChatBrowser)
    return Promise.resolve(null)
  if (window.wx)
    return Promise.resolve(window.wx)
  if (wxSdkPromise)
    return wxSdkPromise
  wxSdkPromise = new Promise<WxJsSdk>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = WX_JSSDK_URL
    script.onload = () => {
      if (window.wx)
        resolve(window.wx)
      else
        reject(new Error('jweixin loaded but window.wx is undefined'))
    }
    script.onerror = () => reject(new Error('jweixin script load failed'))
    document.head.appendChild(script)
  })
  return wxSdkPromise
}

// ===== H5 微信 JSSDK 全局单例(各平台都可安全编译,运行时仅 H5 生效) =====
// 同一 WebView 内重复 wx.config 结果不稳定,故整个 SPA 只 config 一次;各页面
// 在成为“置顶页”时把自己注册为分享数据应用回调,config 就绪后统一触发,避免
// 跨页/返回时分享卡片残留上一页(或站点首页)的数据。
let h5Wx: WxJsSdk | null = null
let h5Configed = false
let h5ConfigPromise: Promise<boolean> | null = null
/** 当前(最近置顶)页面把本页数据写入微信分享卡片的回调 */
let h5CurrentShareApplier: (() => void) | null = null

function setCurrentH5ShareApplier(fn: (() => void) | null): void {
  h5CurrentShareApplier = fn
}

/**
 * 确保 JSSDK 已完成 wx.config(整个页面生命周期仅一次)。
 * @returns 是否配置成功;失败时清空缓存,允许下次(如用户再点分享)重试。
 */
function ensureH5Config(): Promise<boolean> {
  if (h5Configed)
    return Promise.resolve(true)
  if (!isWeChatBrowser)
    return Promise.resolve(false)
  if (h5ConfigPromise)
    return h5ConfigPromise
  h5ConfigPromise = new Promise<boolean>((resolve) => {
    let settled = false
    void (async () => {
      try {
        const wx = await loadWxJsSdk()
        if (!wx) {
          settled = true
          resolve(false)
          return
        }
        // 签名 URL 需去掉 # 及之后的内容(hash 路由的路径/query 都在 # 内,不影响签名)
        const url = window.location.href.split('#')[0]
        const config = await http.get<{ appId: string, timestamp: number, noncestr: string, signature: string }>(
          '/api/wechat/jssdk-config',
          { url },
          undefined,
          { hideErrorToast: true },
        )
        wx.config({
          debug: false,
          appId: config.appId,
          timestamp: config.timestamp,
          nonceStr: config.noncestr,
          signature: config.signature,
          jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
        })
        wx.ready(() => {
          h5Wx = wx
          h5Configed = true
          if (!settled) {
            settled = true
            resolve(true)
          }
          // config 就绪时,把当前置顶页的分享数据写入(可能是 config 等待期间切换到的页面)
          h5CurrentShareApplier?.()
        })
        wx.error((res) => {
          console.warn('[useShare] wx.config failed:', res?.errMsg)
          if (!settled) {
            settled = true
            resolve(false)
          }
        })
      }
      catch (e) {
        // 非微信环境 / 未配置公众号 / 签名失败均静默降级,不阻塞页面
        console.warn('[useShare] H5 share init skipped:', e)
        if (!settled) {
          settled = true
          resolve(false)
        }
      }
    })()
  }).finally(() => {
    // 配置失败时清空缓存,允许下次重试
    if (!h5Configed)
      h5ConfigPromise = null
  })
  return h5ConfigPromise
}

/** 小程序分享完整 path(含 query) */
function buildMpSharePath(opts: UseShareOptions): string {
  const path = toValue(opts.path) || '/pages/index/index'
  const query = toValue(opts.query)
  if (!query)
    return path
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return qs ? `${path}?${qs}` : path
}

/** 小程序朋友圈分享 query(不带 `?`, 由微信拼接到分享卡片) */
function buildMpTimelineQuery(opts: UseShareOptions): string {
  const query = toValue(opts.query)
  if (!query)
    return ''
  return Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

export interface UseShareResult {
  /** H5 分享按钮点击(引导右上角分享); 小程序端为空操作 */
  share: () => void
  /** 好友/群分享数据, 传给 onShareAppMessage(必须在页面顶层注册) */
  shareAppMessage: () => { title: string, path: string, imageUrl?: string }
  /** 朋友圈分享数据, 传给 onShareTimeline(必须在页面顶层注册) */
  shareTimeline: () => { title: string, query?: string, imageUrl?: string }
}

export function useShare(opts: UseShareOptions): UseShareResult {
  // ===== 小程序分享数据(内容在触发时实时读取, 兼容异步加载) =====
  const shareAppMessage = (): { title: string, path: string, imageUrl?: string } => {
    const title = toValue(opts.title)
    const imageUrl = toValue(opts.imageUrl) || DEFAULT_SHARE_IMAGE_PATH
    return {
      title,
      path: buildMpSharePath(opts),
      ...(imageUrl ? { imageUrl } : {}),
    }
  }

  const shareTimeline = (): { title: string, query?: string, imageUrl?: string } => {
    const title = toValue(opts.title)
    const imageUrl = toValue(opts.imageUrl) || DEFAULT_SHARE_IMAGE_PATH
    const query = buildMpTimelineQuery(opts)
    return {
      title,
      ...(query ? { query } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    }
  }

  // ===== H5 微信 JSSDK(config 为全局单例,每页只负责刷新本页分享数据) =====
  // #ifdef H5
  let h5Alive = true

  /**
   * 把本页(title/desc/imageUrl + 当前完整链接)写入微信分享卡片。
   * 仅当自己仍是“当前置顶页”时执行,避免后台页晚到的数据覆盖置顶页卡片。
   */
  function applyCurrentPageShareData(): void {
    if (!h5Alive || !h5Configed || !h5Wx || h5CurrentShareApplier !== applyCurrentPageShareData)
      return
    // 分享出去的落地链接必须保留路由与 query(hash 模式在 # 之后),
    // 否则好友/群收到的卡片打开后只会落到站点首页,丢失被分享的页面。
    const link = window.location.href
    const title = toValue(opts.title)
    const desc = toValue(opts.desc)
    // 未传图时用默认 logo 兜底;JSSDK 的 imgUrl 必须是绝对 http(s) URL,
    // 且要带上部署根路径(import.meta.env.BASE_URL),否则子路径部署时取图 404
    const h5PublicBase = (import.meta.env.VITE_APP_PUBLIC_BASE || '/').replace(/\/+$/, '')
    const imageUrl = toValue(opts.imageUrl) || `${window.location.origin}${h5PublicBase}${DEFAULT_SHARE_IMAGE_PATH}`
    h5Wx.updateAppMessageShareData({
      title,
      ...(desc ? { desc } : {}),
      link,
      ...(imageUrl ? { imgUrl: imageUrl } : {}),
    })
    h5Wx.updateTimelineShareData({
      title,
      link,
      ...(imageUrl ? { imgUrl: imageUrl } : {}),
    })
  }

  /** 本页成为置顶页时:注册为本页的应用回调并立即应用(数据未就绪则由 watch 补齐) */
  function onPageActivated(): void {
    if (!isWeChatBrowser)
      return
    setCurrentH5ShareApplier(applyCurrentPageShareData)
    if (h5Configed) {
      applyCurrentPageShareData()
    }
    else {
      void ensureH5Config().then((ok) => {
        if (ok && h5Alive)
          applyCurrentPageShareData()
      })
    }
  }

  onMounted(onPageActivated)
  onShow(onPageActivated)
  onHide(() => {
    if (h5CurrentShareApplier === applyCurrentPageShareData)
      setCurrentH5ShareApplier(null)
  })
  onUnmounted(() => {
    h5Alive = false
    if (h5CurrentShareApplier === applyCurrentPageShareData)
      setCurrentH5ShareApplier(null)
  })

  // 分享内容变化时(如 circle 详情异步加载完成),刷新微信分享数据
  watch(
    [() => toValue(opts.title), () => toValue(opts.desc), () => toValue(opts.imageUrl)],
    () => {
      if (h5Alive)
        applyCurrentPageShareData()
    },
  )
  // #endif

  function share(): void {
    // #ifdef H5
    if (!isWeChatBrowser) {
      uni.showToast({ title: '请在微信浏览器中打开后分享', icon: 'none' })
      return
    }
    if (h5Configed) {
      uni.showToast({ title: '请点击右上角 ··· 分享到好友/朋友圈', icon: 'none' })
      return
    }
    void ensureH5Config().then((ok) => {
      if (ok) {
        h5CurrentShareApplier?.()
        uni.showToast({ title: '请点击右上角 ··· 分享到好友/朋友圈', icon: 'none' })
      }
      else {
        uni.showToast({ title: '分享初始化失败,请稍后重试', icon: 'none' })
      }
    })
    // #endif
    // #ifndef H5
    // 小程序端由 open-type="share" 触发原生转发, 无需额外逻辑
    // #endif
  }

  return { share, shareAppMessage, shareTimeline }
}

export default useShare
