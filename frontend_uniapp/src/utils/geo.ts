import { http } from "@/http/http"

/**
 * 跨端逆地理编码(经纬度 → 格式化地址)。
 *
 * - H5:走浏览器高德 JS API(@/utils/amap),密钥由后端 /api/config/amap.js 注入
 * - 小程序及其他端:走后端 /api/geo/reverse(服务端用高德 Web 服务做逆地理,
 *   密钥不下发客户端,避免泄露)
 *
 * @param lat 纬度(gcj02)
 * @param lng 经度(gcj02)
 * @returns 格式化地址;失败兜底返回空串(调用方应自行降级为"已定位")
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // #ifdef H5
  const { reverseGeocode: amapReverseGeocode } = await import("@/utils/amap")
  try {
    return await amapReverseGeocode(lat, lng)
  }
  catch {
    return ""
  }
  // #endif

  // #ifndef H5
  try {
    const res = await http.get<{ address: string }>("/api/geo/reverse", {
      latitude: lat,
      longitude: lng,
    })
    return res?.address || ""
  }
  catch(e: any) {
    console.error("reverseGeocode error:", e)
    return ""
  }
  // #endif
}
