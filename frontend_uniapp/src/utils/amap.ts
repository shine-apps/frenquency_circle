/**
 * 高德地图 JS API 加载、定位与逆地理编码工具(仅 H5 端使用)。
 *
 * 设计要点:
 * - 动态注入 <script> 加载高德 JS API 2.0,避免引入 npm 包增加打包体积
 * - 加载前设置 window._AMapSecurityConfig(安全密钥,2021 起强制要求)
 * - 缓存 Promise 避免重复加载
 * - 坐标顺序:高德 API 使用 [lng, lat](经度在前),对外保持 (lat, lng) 语义,内部转换
 * - getAMapLocation 使用 AMap.Geolocation 插件,原生返回 GCJ02 坐标
 *
 * 注意:key / securityCode 由后端 admin 的 GET /config/amap.js 端点提供,
 * 本模块在运行时按项目对接方式(完整 baseUrl,见 getEnvBaseUrl)动态拉取并写入
 * window 全局,无需在 index.html 中硬编码同步脚本。
 */
import { getEnvBaseUrl } from '@/utils'

declare global {
  interface Window {
    AMap?: any
    /** 高德安全密钥配置,须在 script 加载前设置 */
    _AMapSecurityConfig?: { securityJsCode: string }
    /**
     * 运行时注入的高德地图 key / 安全密钥,由 admin 的
     * GET /config/amap.js 端点返回并赋值。
     */
    __AMAP_KEY__?: string
    __AMAP_SECURITY_CODE__?: string
  }
}

/** 高德 SDK 加载 Promise 缓存(单例) */
let amapPromise: Promise<any> | null = null
/** admin 配置脚本加载 Promise 缓存(单例),避免重复请求 */
let configPromise: Promise<void> | null = null

/**
 * 拉取 admin 的 GET /config/amap.js,把 AMAP_KEY / AMAP_SECURITY_CODE
 * 写入 window 全局。地址走项目统一 baseUrl(与拦截器、上传一致),
 * 兼容 dev/prod,无需依赖 /api 相对路径代理。
 */
function loadAmapConfig(): Promise<void> {
  if (configPromise)
    return configPromise
  if (window.__AMAP_KEY__ !== undefined)
    return (configPromise = Promise.resolve())

  configPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${getEnvBaseUrl()}/api/config/amap.js`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error('高德配置加载失败：/config/amap.js 请求错误'))
    document.head.appendChild(script)
  })

  return configPromise
}

/**
 * 加载高德地图 JS API(含 Geocoder 插件)。
 * 重复调用返回同一个 Promise。
 */
export function loadAMap(): Promise<any> {
  if (amapPromise)
    return amapPromise

  amapPromise = (async () => {
    // 已加载直接复用
    if (window.AMap)
      return window.AMap

    // 先确保 key / 安全密钥已就绪
    await loadAmapConfig()

    const amapKey = window.__AMAP_KEY__ || ''
    const amapSecurityCode = window.__AMAP_SECURITY_CODE__ || ''

    // 未配置 Key 时提前失败,避免加载带空 key 的无效脚本(高德会报错且
    // window.AMap 可能为 undefined,错误信息不明确)。属可预期降级,业务侧已捕获。
    if (!amapKey) {
      throw new Error('高德地图 SDK 加载失败：未配置 AMAP_KEY（请在 admin 环境变量 AMAP_KEY 中设置）')
    }

    // 设置安全密钥(必须在高德 script 加载前)
    window._AMapSecurityConfig = {
      securityJsCode: amapSecurityCode,
    }

    return await new Promise<any>((resolve, reject) => {
      const script = document.createElement('script')
      // 加载 2.0 版本,预加载 Geocoder(逆地理)与 Geolocation(定位)插件
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}&plugin=AMap.Geocoder,AMap.Geolocation`
      script.async = true
      script.onload = () => {
        if (window.AMap)
          resolve(window.AMap)
        else
          reject(new Error('高德地图 SDK 加载失败'))
      }
      script.onerror = () =>
        reject(new Error('高德地图 SDK 加载失败,请检查网络'))
      document.head.appendChild(script)
    })
  })().catch((err) => {
    // 失败重置,允许下次重试(如网络恢复后重新定位)
    amapPromise = null
    configPromise = null
    throw err
  })

  return amapPromise
}

/**
 * 逆地理编码:经纬度 → 格式化地址字符串。
 *
 * @param lat 纬度(gcj02)
 * @param lng 经度(gcj02)
 * @returns 格式化地址;失败兜底返回 "已定位"
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const AMap = await loadAMap()
    const geocoder = new AMap.Geocoder({ extensions: 'all' })
    // 高德坐标顺序为 [lng, lat]
    return await new Promise<string>((resolve) => {
      geocoder.getAddress([lng, lat], (status: string, result: any) => {
        if (status === 'complete' && result?.info === 'OK') {
          resolve(result?.regeocode?.formattedAddress || '已定位')
        }
        else {
          resolve('已定位')
        }
      })
    })
  }
  catch {
    return '已定位'
  }
}

/**
 * H5 端获取当前定位(使用高德定位插件,返回 GCJ02 坐标)。
 * 高德定位插件原生返回 GCJ02 坐标,无需额外坐标转换。
 *
 * @returns { latitude, longitude } GCJ02 坐标
 */
export async function getAMapLocation(): Promise<{ latitude: number; longitude: number }> {
  const AMap = await loadAMap()
  return new Promise((resolve, reject) => {
    AMap.plugin('AMap.Geolocation', () => {
      const geolocation = new AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 10000,
        GeoLocationFirst: true,
        convert: true, // 自动转为 GCJ02(高德坐标)
      })
      geolocation.getCurrentPosition((status: string, result: any) => {
        if (status === 'complete' && result?.position) {
          const pos = result.position
          // position 可能是 LngLat 对象或普通对象,兼容两种取值方式
          const lat = typeof pos.getLat === 'function' ? pos.getLat() : pos.lat
          const lng = typeof pos.getLng === 'function' ? pos.getLng() : pos.lng
          resolve({ latitude: lat, longitude: lng })
        }
        else {
          reject(new Error(result?.message || '定位失败'))
        }
      })
    })
  })
}
