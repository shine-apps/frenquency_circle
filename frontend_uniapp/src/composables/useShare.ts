import { onMounted, onUnmounted, toValue, watch } from 'vue'
import type { Ref } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { http } from '@/http/http'

/**
 * useShare - 统一分享 Composable
 *
 * 小程序(MP-WEIXIN)
 *   返回 shareAppMessage(好友)/shareTimeline(朋友圈)所需的分享数据,内容在用户点击
 *   转发时实时读取,天然兼容异步加载。注意:微信编译器只收集页面 <script setup> 顶层
 *   直接注册的分享钩子,页面必须自行调用 onShareAppMessage / onShareTimeline。
 *
 * H5(微信内置浏览器)
 *   整个 SPA 只 wx.config 一次(全局单例);config 成功后由「当前置顶页」把本页数据
 *   写入分享卡片。分享链接取当前页完整 URL(含 hash 路由与 query),后端签名则使用
 *   去掉 # 之后的 URL。非微信浏览器或未配置公众号时静默降级,不影响页面。
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

export interface UseShareResult {
  /** H5 分享按钮点击(引导右上角分享); 小程序端为空操作 */
  share: () => void
  /** 好友/群分享数据, 传给 onShareAppMessage(必须在页面顶层注册) */
  shareAppMessage: () => { title: string, path: string, imageUrl?: string }
  /** 朋友圈分享数据, 传给 onShareTimeline(必须在页面顶层注册) */
  shareTimeline: () => { title: string, query?: string, imageUrl?: string }
}

/** 调用方未传 imageUrl(或为空)时的兜底分享图 */
const DEFAULT_SHARE_IMAGE_PATH = '/static/images/logo.png'

/** 过滤掉 undefined / null 的分享 query */
function validQueryEntries(query?: Record<string, string>): [string, string][] {
  if (!query)
    return []
  return Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
}

// ========================= 小程序分享数据 =========================

/** 小程序好友分享完整 path(含 query) */
function buildMpSharePath(opts: UseShareOptions): string {
  const path = toValue(opts.path) || '/pages/index/index'
  const qs = validQueryEntries(toValue(opts.query))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return qs ? `${path}?${qs}` : path
}

/** 小程序朋友圈分享 query(不带 `?`, 由微信拼接到分享卡片) */
function buildMpTimelineQuery(opts: UseShareOptions): string {
  return validQueryEntries(toValue(opts.query))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

// ========================= H5 微信 JSSDK =========================

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
  /** 新分享接口(需公众号已微信认证) */
  updateAppMessageShareData: (options: ShareDataOptions & { desc?: string }) => void
  updateTimelineShareData: (options: ShareDataOptions) => void
  /** 旧分享接口(未认证账号仍可用,用于权限不足时降级) */
  onMenuShareAppMessage?: (options: ShareDataOptions & { desc?: string }) => void
  onMenuShareTimeline?: (options: ShareDataOptions) => void
}

interface ShareDataOptions {
  title: string
  link: string
  imgUrl?: string
  fail?: (res: { errMsg?: string }) => void
}

/** 写入分享卡片的完整数据 */
interface SharePayload {
  title: string
  desc?: string
  link: string
  imgUrl?: string
}

declare global {
  interface Window { wx?: WxJsSdk }
}

/** 是否微信内置浏览器(非浏览器环境下安全返回 false) */
const isWeChatBrowser = typeof window !== 'undefined' && /micromessenger/i.test(navigator.userAgent)

/**
 * H5 微信分享全局状态: 整个 SPA 共享一份。
 * 同一 WebView 内重复 wx.config 结果不稳定,故只 config 一次,由「当前置顶页」
 * 负责把本页数据写入分享卡片,避免跨页/返回时残留上一页或站点首页的数据。
 */
const h5 = {
  /** 已 config 成功的 JSSDK 实例; 非空即代表 config 已完成 */
  wx: null as WxJsSdk | null,
  /** 进行中的 config Promise, 避免并发重复 config */
  configPromise: null as Promise<boolean> | null,
  /** 最近一次 config 的失败原因, 用于排障提示 */
  configError: null as string | null,
  /** 公众号未认证时新接口会 offline verifying, 全局降级到旧 onMenuShare* 接口 */
  legacyShareApi: false,
  /** 当前置顶页写入分享卡片的回调(每页一个, 仅置顶页生效) */
  applyCurrentPage: null as (() => void) | null,
}

const WX_JSSDK_URL = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js'

/**
 * 取出真正的 JSSDK 对象。部分宿主会先挂一个同名但不完整的 window.wx
 * (如只有 miniProgram 命名空间,没有 config),此时必须继续加载 jweixin 覆盖它,
 * 否则会出现 `wx.config is not a function`。
 */
function getWxJsSdk(): WxJsSdk | null {
  const wx = window.wx
  if (wx && typeof wx.config === 'function')
    return wx
  if (wx)
    console.warn('[useShare] window.wx 存在但不是 JSSDK:', Object.keys(wx))
  return null
}

let sdkLoadingPromise: Promise<WxJsSdk | null> | null = null

/** 按需加载 jweixin 并缓存 Promise, 避免重复插入 script */
function loadWxJsSdk(): Promise<WxJsSdk | null> {
  if (!isWeChatBrowser)
    return Promise.resolve(null)
  const existing = getWxJsSdk()
  if (existing)
    return Promise.resolve(existing)
  if (!sdkLoadingPromise) {
    sdkLoadingPromise = new Promise<WxJsSdk>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = WX_JSSDK_URL
      script.onload = () => {
        const loaded = getWxJsSdk()
        if (loaded)
          resolve(loaded)
        else
          reject(new Error('jweixin 已加载但 window.wx.config 不可用'))
      }
      script.onerror = () => reject(new Error('jweixin 脚本加载失败'))
      document.head.appendChild(script)
    })
  }
  return sdkLoadingPromise
}

/** 执行一次 wx.config(签名 URL 需去掉 # 及之后内容) */
async function configWx(): Promise<boolean> {
  try {
    const wx = await loadWxJsSdk()
    if (!wx)
      return false
    const config = await http.get<{ appId: string, timestamp: number, noncestr: string, signature: string }>(
      '/api/wechat/jssdk-config',
      { url: window.location.href.split('#')[0] },
      undefined,
      { hideErrorToast: true },
    )
    return await new Promise<boolean>((resolve) => {
      wx.config({
        // 开发环境自动开启 JSSDK 调试弹窗(直观看到 config / API 的 errMsg),生产恒关闭
        debug: import.meta.env.DEV,
        appId: config.appId,
        timestamp: config.timestamp,
        nonceStr: config.noncestr,
        signature: config.signature,
        // 同时申请旧分享接口权限:未认证账号的新接口会 offline verifying,届时可降级
        jsApiList: [
          'updateAppMessageShareData',
          'updateTimelineShareData',
          'onMenuShareAppMessage',
          'onMenuShareTimeline',
        ],
      })
      wx.ready(() => {
        h5.wx = wx
        h5.configError = null
        resolve(true)
      })
      wx.error((res) => {
        h5.configError = res?.errMsg ? String(res.errMsg) : 'wx.config error'
        console.warn('[useShare] wx.config 失败:', h5.configError)
        resolve(false)
      })
    })
  }
  catch (e) {
    // 非微信环境 / 未配置公众号 / 签名失败均静默降级,不阻塞页面
    h5.configError = e instanceof Error ? e.message : String(e)
    console.warn('[useShare] H5 分享初始化跳过:', e)
    return false
  }
}

/**
 * 确保 JSSDK 完成一次 wx.config。
 * @returns 是否配置成功;失败时清空缓存,允许下次(如用户再点分享)重试。
 */
function ensureH5Config(): Promise<boolean> {
  if (h5.wx)
    return Promise.resolve(true)
  if (!isWeChatBrowser)
    return Promise.resolve(false)
  if (h5.configPromise)
    return h5.configPromise

  h5.configPromise = configWx().then((ok) => {
    if (ok)
      h5.applyCurrentPage?.() // config 期间可能已切页, 补写当前置顶页卡片
    else
      h5.configPromise = null // 失败清空缓存, 允许下次重试
    return ok
  })
  return h5.configPromise
}

/** 用旧接口(onMenuShare*)写入分享卡片 */
function applyLegacyShare(data: SharePayload): void {
  h5.wx?.onMenuShareAppMessage?.({ ...data })
  h5.wx?.onMenuShareTimeline?.({ title: data.title, link: data.link, imgUrl: data.imgUrl })
}

/**
 * 写入分享数据。新接口(1.4+)要求公众号已微信认证,未认证会返回
 * `the permission value is offline verifying`,此时全局降级到旧接口重发一次。
 */
function writeShareData(data: SharePayload): void {
  if (!h5.wx)
    return
  if (h5.legacyShareApi) {
    applyLegacyShare(data)
    return
  }
  const onFail = (res: { errMsg?: string }): void => {
    if (/offline\s+verifying/i.test(res?.errMsg ?? '') && !h5.legacyShareApi) {
      console.warn('[useShare] 新分享接口无权限,降级到 onMenuShare* 旧接口:', res?.errMsg)
      h5.legacyShareApi = true
      applyLegacyShare(data)
    }
  }
  h5.wx.updateAppMessageShareData({ ...data, fail: onFail })
  h5.wx.updateTimelineShareData({ title: data.title, link: data.link, imgUrl: data.imgUrl, fail: onFail })
}

/** 图片路径转绝对 http(s) URL(JSSDK 要求),并带上部署根路径 */
function toAbsoluteImageUrl(path: string): string {
  if (/^https?:\/\//i.test(path))
    return path
  const base = (import.meta.env.VITE_APP_PUBLIC_BASE || '/').replace(/\/+$/, '')
  return `${window.location.origin}${base}${path.startsWith('/') ? '' : '/'}${path}`
}

// ========================= Composable =========================

export function useShare(opts: UseShareOptions): UseShareResult {
  // ===== 小程序分享数据(触发时实时读取, 兼容异步加载) =====
  const shareAppMessage = (): { title: string, path: string, imageUrl?: string } => ({
    title: toValue(opts.title),
    path: buildMpSharePath(opts),
    imageUrl: toValue(opts.imageUrl) || DEFAULT_SHARE_IMAGE_PATH,
  })

  const shareTimeline = (): { title: string, query?: string, imageUrl?: string } => {
    const query = buildMpTimelineQuery(opts)
    return {
      title: toValue(opts.title),
      ...(query ? { query } : {}),
      imageUrl: toValue(opts.imageUrl) || DEFAULT_SHARE_IMAGE_PATH,
    }
  }

  // ===== H5: config 全局单例, 每页只负责刷新本页分享数据 =====
  // #ifdef H5
  let h5Alive = true

  /** 组装本页分享数据; link 用当前完整 URL 以保留 hash 路由与 query */
  function buildH5SharePayload(): SharePayload {
    const desc = toValue(opts.desc)
    const imageUrl = toValue(opts.imageUrl) || DEFAULT_SHARE_IMAGE_PATH
    return {
      title: toValue(opts.title),
      ...(desc ? { desc } : {}),
      link: window.location.href,
      imgUrl: toAbsoluteImageUrl(imageUrl),
    }
  }

  /** 把本页数据写入微信分享卡片;仅当自己仍是置顶页时才生效 */
  function applyCurrentPageShare(): void {
    if (!h5Alive || !h5.wx || h5.applyCurrentPage !== applyCurrentPageShare)
      return
    writeShareData(buildH5SharePayload())
  }

  /** 本页成为置顶页(挂载/显示): 注册为当前页并应用数据 */
  function activatePage(): void {
    if (!isWeChatBrowser)
      return
    h5.applyCurrentPage = applyCurrentPageShare
    if (h5.wx)
      applyCurrentPageShare()
    else
      void ensureH5Config()
  }

  /** 本页隐藏/卸载: 若自己仍是当前页则注销, 避免残留覆盖他页 */
  function deactivatePage(): void {
    if (h5.applyCurrentPage === applyCurrentPageShare)
      h5.applyCurrentPage = null
  }

  onMounted(activatePage)
  onShow(activatePage)
  onHide(deactivatePage)
  onUnmounted(() => {
    h5Alive = false
    deactivatePage()
  })

  // 分享内容变化时(如详情异步加载完成), 刷新微信分享数据
  watch(
    [() => toValue(opts.title), () => toValue(opts.desc), () => toValue(opts.imageUrl)],
    () => {
      if (h5Alive)
        applyCurrentPageShare()
    },
  )
  // #endif

  function share(): void {
    // #ifdef H5
    if (!isWeChatBrowser) {
      uni.showToast({ title: '请在微信浏览器中打开后分享', icon: 'none' })
      return
    }
    if (h5.wx) {
      uni.showToast({ title: '请点击右上角 ··· 分享到好友/朋友圈', icon: 'none' })
      return
    }
    void ensureH5Config().then((ok) => {
      if (ok) {
        // config 成功时 ensureH5Config 已写入当前置顶页数据, 这里只需提示
        uni.showToast({ title: '请点击右上角 ··· 分享到好友/朋友圈', icon: 'none' })
      }
      else {
        // 带上真实失败原因(invalid signature / invalid url domain 等),便于定位
        uni.showToast({ title: `分享初始化失败:${h5.configError ?? '未知错误'}`, icon: 'none' })
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
