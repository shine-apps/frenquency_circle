import { onMounted, toValue, watch } from 'vue'
import type { Ref } from 'vue'
import { http } from '@/http/http'

/**
 * useShare - 统一分享 Composable
 *
 * - 小程序(MP-WEIXIN):返回 shareAppMessage(好友)/shareTimeline(朋友圈)分享数据,
 *   内容在用户点击转发时才读取最新值,支持异步加载的数据。
 *   注意:微信小程序编译器只收集页面 <script setup> 顶层直接调用的分享钩子,
 *   因此页面必须自行在顶层调用 onShareAppMessage / onShareTimeline 完成注册。
 * - H5(微信浏览器):动态加载 jweixin,请求后端 JSSDK 签名接口完成 wx.config,
 *   并配置 updateAppMessageShareData / updateTimelineShareData;
 *   非微信浏览器或未配置公众号时静默降级,不影响页面。
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
    const imageUrl = toValue(opts.imageUrl)
    return {
      title,
      path: buildMpSharePath(opts),
      ...(imageUrl ? { imageUrl } : {}),
    }
  }

  const shareTimeline = (): { title: string, query?: string, imageUrl?: string } => {
    const title = toValue(opts.title)
    const imageUrl = toValue(opts.imageUrl)
    const query = buildMpTimelineQuery(opts)
    return {
      title,
      ...(query ? { query } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    }
  }

  // ===== H5 微信 JSSDK(运行时逻辑, 可封装在 composable 中) =====
  // #ifdef H5
  let h5Wx: WxJsSdk | null = null
  let h5Configed = false

  function applyH5ShareData(wx: WxJsSdk): void {
    const link = window.location.href.split('#')[0]
    const title = toValue(opts.title)
    const desc = toValue(opts.desc)
    const imageUrl = toValue(opts.imageUrl)
    wx.updateAppMessageShareData({
      title,
      ...(desc ? { desc } : {}),
      link,
      ...(imageUrl ? { imgUrl: imageUrl } : {}),
    })
    wx.updateTimelineShareData({
      title,
      link,
      ...(imageUrl ? { imgUrl: imageUrl } : {}),
    })
  }

  async function initH5Share(): Promise<void> {
    try {
      const wx = await loadWxJsSdk()
      if (!wx)
        return
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
        applyH5ShareData(wx)
      })
      wx.error((res) => {
        console.warn('[useShare] wx.config failed:', res?.errMsg)
      })
    }
    catch (e) {
      // 非微信环境 / 未配置公众号 / 签名失败均静默降级, 不阻塞页面
      console.warn('[useShare] H5 share init skipped:', e)
    }
  }

  onMounted(() => {
    void initH5Share()
  })

  // 分享内容变化时(如 circle 详情异步加载完成), 已 config 则刷新微信分享数据
  watch(
    [() => toValue(opts.title), () => toValue(opts.desc), () => toValue(opts.imageUrl)],
    () => {
      if (h5Configed && h5Wx)
        applyH5ShareData(h5Wx)
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
    void initH5Share().then(() => {
      if (h5Configed)
        uni.showToast({ title: '请点击右上角 ··· 分享到好友/朋友圈', icon: 'none' })
      else
        uni.showToast({ title: '分享初始化失败,请稍后重试', icon: 'none' })
    })
    // #endif
    // #ifndef H5
    // 小程序端由 open-type="share" 触发原生转发, 无需额外逻辑
    // #endif
  }

  return { share, shareAppMessage, shareTimeline }
}

export default useShare
