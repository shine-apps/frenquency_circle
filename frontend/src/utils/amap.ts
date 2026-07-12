/**
 * 高德地图 JS API 加载与逆地理编码工具(仅 H5 端使用)。
 *
 * 设计要点:
 * - 动态注入 <script> 加载高德 JS API 2.0,避免引入 npm 包增加打包体积
 * - 加载前设置 window._AMapSecurityConfig(安全密钥,2021 起强制要求)
 * - 缓存 Promise 避免重复加载
 * - 坐标顺序:高德 API 使用 [lng, lat](经度在前),对外保持 (lat, lng) 语义,内部转换
 */

declare global {
  interface Window {
    AMap?: any
    /** 高德安全密钥配置,须在 script 加载前设置 */
    _AMapSecurityConfig?: { securityJsCode: string }
  }
}

/** 高德 SDK 加载 Promise 缓存(单例) */
let amapPromise: Promise<any> | null = null

/**
 * 加载高德地图 JS API(含 Geocoder 插件)。
 * 重复调用返回同一个 Promise。
 */
export function loadAMap(): Promise<any> {
  if (amapPromise) return amapPromise

  amapPromise = new Promise<any>((resolve, reject) => {
    // 已加载直接复用
    if (window.AMap) {
      resolve(window.AMap)
      return
    }

    // 设置安全密钥(必须在 script 加载前)
    window._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY_CODE,
    }

    const script = document.createElement('script')
    // 加载 2.0 版本,内置 Geocoder 插件按需引入
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Geocoder`
    script.async = true
    script.onload = () => {
      if (window.AMap) {
        resolve(window.AMap)
      } else {
        amapPromise = null
        reject(new Error('高德地图 SDK 加载失败'))
      }
    }
    script.onerror = () => {
      amapPromise = null
      reject(new Error('高德地图 SDK 加载失败,请检查网络'))
    }
    document.head.appendChild(script)
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
        } else {
          resolve('已定位')
        }
      })
    })
  } catch {
    return '已定位'
  }
}
