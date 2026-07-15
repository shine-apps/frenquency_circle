/**
 * 高德地图 JS API 加载、定位与逆地理编码工具(仅 H5 端使用)。
 *
 * 设计要点:
 * - 动态注入 <script> 加载高德 JS API 2.0,避免引入 npm 包增加打包体积
 * - 加载前设置 window._AMapSecurityConfig(安全密钥,2021 起强制要求)
 * - 缓存 Promise 避免重复加载
 * - 坐标顺序:高德 API 使用 [lng, lat](经度在前),对外保持 (lat, lng) 语义,内部转换
 * - getAMapLocation 使用 AMap.Geolocation 插件,原生返回 GCJ02 坐标,
 *   替代 Taro.getLocation({ type: 'gcj02' })(H5 端不支持 gcj02 坐标系)
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
    // 加载 2.0 版本,预加载 Geocoder(逆地理)与 Geolocation(定位)插件
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Geocoder,AMap.Geolocation`
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

/**
 * H5 端获取当前定位(使用高德定位插件,返回 GCJ02 坐标)。
 *
 * 高德定位插件原生返回 GCJ02 坐标,无需额外坐标转换。
 * 替代 Taro.getLocation({ type: 'gcj02' })——Taro 4.1.9 H5 端
 * 不支持 gcj02 坐标系(会报 "This coordinate system type is not temporarily supported")。
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
        convert: true, // 自动转为 GCJ02(高德坐标),默认 true,显式设置以明确意图
      })
      geolocation.getCurrentPosition((status: string, result: any) => {
        if (status === 'complete' && result?.position) {
          const pos = result.position
          // position 可能是 LngLat 对象或普通对象,兼容两种取值方式
          const lat = typeof pos.getLat === 'function' ? pos.getLat() : pos.lat
          const lng = typeof pos.getLng === 'function' ? pos.getLng() : pos.lng
          resolve({ latitude: lat, longitude: lng })
        } else {
          reject(new Error(result?.message || '定位失败'))
        }
      })
    })
  })
}
