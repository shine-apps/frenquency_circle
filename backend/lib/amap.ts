/**
 * 高德地图 JS API 加载、逆地理编码与 POI 搜索工具（仅客户端使用）。
 *
 * 设计要点：
 * - 动态注入 <script> 加载高德 JS API 2.0，避免引入 npm 包增加打包体积
 * - 加载前设置 window._AMapSecurityConfig（安全密钥，2021 起强制要求）
 * - key / securityCode 由同源的 GET /api/config/amap.js 端点注入
 * - 缓存 Promise 避免重复加载
 * - 坐标顺序：高德 API 使用 [lng, lat]（经度在前），对外保持 (lat, lng) 语义
 */

declare global {
  interface Window {
    AMap?: any
    /** 高德安全密钥配置，须在 script 加载前设置 */
    _AMapSecurityConfig?: { securityJsCode: string }
    /** 运行时注入的高德地图 key / 安全密钥 */
    __AMAP_KEY__?: string
    __AMAP_SECURITY_CODE__?: string
  }
}

/** 高德 SDK 加载 Promise 缓存（单例） */
let amapPromise: Promise<any> | null = null
/** 配置脚本加载 Promise 缓存（单例），避免重复请求 */
let configPromise: Promise<void> | null = null

/**
 * 拉取同源 GET /api/config/amap.js，把 AMAP_KEY / AMAP_SECURITY_CODE
 * 写入 window 全局。
 */
function loadAmapConfig(): Promise<void> {
  if (configPromise) return configPromise
  if (window.__AMAP_KEY__ !== undefined) return (configPromise = Promise.resolve())

  configPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "/api/config/amap.js"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("高德配置加载失败：/api/config/amap.js 请求错误"))
    document.head.appendChild(script)
  })

  return configPromise
}

/**
 * 加载高德地图 JS API（含 Geocoder / PlaceSearch 插件）。
 * 重复调用返回同一个 Promise。
 */
export function loadAMap(): Promise<any> {
  if (amapPromise) return amapPromise

  amapPromise = (async () => {
    // 已加载直接复用
    if (window.AMap) return window.AMap

    // 先确保 key / 安全密钥已就绪
    await loadAmapConfig()

    const amapKey = window.__AMAP_KEY__ || ""
    const amapSecurityCode = window.__AMAP_SECURITY_CODE__ || ""

    if (!amapKey) {
      throw new Error(
        "高德地图 SDK 加载失败：未配置 AMAP_KEY（请在 admin 环境变量 AMAP_KEY 中设置）"
      )
    }

    // 设置安全密钥（必须在高德 script 加载前）
    window._AMapSecurityConfig = { securityJsCode: amapSecurityCode }

    return await new Promise<any>((resolve, reject) => {
      const script = document.createElement("script")
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}&plugin=AMap.Geocoder,AMap.PlaceSearch`
      script.async = true
      script.onload = () => {
        if (window.AMap) resolve(window.AMap)
        else reject(new Error("高德地图 SDK 加载失败"))
      }
      script.onerror = () =>
        reject(new Error("高德地图 SDK 加载失败，请检查网络"))
      document.head.appendChild(script)
    })
  })().catch((err) => {
    // 失败重置，允许下次重试（如网络恢复后重新加载）
    amapPromise = null
    configPromise = null
    throw err
  })

  return amapPromise
}

/**
 * 逆地理编码：经纬度 → 格式化地址字符串。
 * @param lat 纬度（gcj02）
 * @param lng 经度（gcj02）
 * @returns 格式化地址；失败兜底返回 "已定位"
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const AMap = await loadAMap()
    const geocoder = new AMap.Geocoder({ extensions: "all" })
    // 高德坐标顺序为 [lng, lat]
    return await new Promise<string>((resolve) => {
      geocoder.getAddress([lng, lat], (status: string, result: any) => {
        if (status === "complete" && result?.info === "OK") {
          resolve(result?.regeocode?.formattedAddress || "已定位")
        } else {
          resolve("已定位")
        }
      })
    })
  } catch {
    return "已定位"
  }
}

/** POI 搜索结果条目 */
export interface PlaceSearchResult {
  id: string
  name: string
  address: string
  district: string
  lat: number
  lng: number
}

/**
 * 关键词搜索 POI 地点（使用高德 PlaceSearch 插件）。
 *
 * @param keyword 搜索关键词（如 "天安门"）
 * @returns 命中的地点列表（无结果 / 失败时返回空数组）
 */
export async function searchPlaces(keyword: string): Promise<PlaceSearchResult[]> {
  try {
    const AMap = await loadAMap()
    return await new Promise<PlaceSearchResult[]>((resolve) => {
      AMap.plugin("AMap.PlaceSearch", () => {
        const placeSearch = new AMap.PlaceSearch({
          pageSize: 10,
          pageIndex: 1,
          city: "全国",
          extensions: "all",
        })
        placeSearch.search(keyword, (status: string, result: any) => {
          if (status === "complete" && result?.poiList?.pois) {
            resolve(
              result.poiList.pois.map((poi: any) => {
                const loc = poi.location
                return {
                  id: poi.id || "",
                  name: poi.name || "",
                  address: poi.address || poi.pname || "",
                  district: poi.adname || poi.district || "",
                  lat:
                    typeof loc?.getLat === "function" ? loc.getLat() : loc?.lat,
                  lng:
                    typeof loc?.getLng === "function" ? loc.getLng() : loc?.lng,
                }
              })
            )
          } else {
            resolve([])
          }
        })
      })
    })
  } catch {
    return []
  }
}
