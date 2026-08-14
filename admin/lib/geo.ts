/**
 * 服务端逆地理编码(经纬度 → 地址)。
 *
 * 使用高德 Web 服务 REST API(v3/geocode/regeo),密钥在服务端持有,
 * 不下发到客户端(微信小程序端无法直接用浏览器高德 JS API,故由后端代理)。
 *
 * 文档: https://lbs.amap.com/api/webservice/guide/api/georegeo
 *
 * 注意:
 * - 高德 REST API 需要"Web服务"类型的 Key,与 H5 用的"Web端(JS API)"Key 不同。
 *   优先取 AMAP_REST_KEY,回退到 AMAP_KEY(若后者是 JS API Key,高德会返回
 *   USERKEY_PLAT_NOMATCH,需改用 Web服务 Key)。
 * - 经纬度顺序:高德 REST 要求 location=lng,lat(经度在前)。
 */

/** 逆地理编码返回结果 */
export interface RegeoResult {
  /** 完整格式化地址 */
  address: string
  /** 省份 */
  province?: string
  /** 城市(直辖市可能为空,取 province) */
  city?: string
  /** 区县 */
  district?: string
}

/**
 * 逆地理编码。
 * @param lat 纬度(gcj02)
 * @param lng 经度(gcj02)
 * @returns 地址信息;高德返回失败时抛出 Error
 */
export async function reverseGeocode({
  lat,
  lng,
}: {
  lat: number
  lng: number
}): Promise<RegeoResult> {
  const key = process.env.AMAP_REST_KEY ?? process.env.AMAP_KEY ?? ""
  if (!key) {
    throw new Error("AMAP key not configured (set AMAP_REST_KEY or AMAP_KEY)")
  }

  const url =
    `https://restapi.amap.com/v3/geocode/regeo`
    + `?location=${encodeURIComponent(`${lng},${lat}`)}`
    + `&key=${encodeURIComponent(key)}`
    + `&extensions=all&radius=1000&roadlevel=0`

  const res = await fetch(url)
  const data = (await res.json().catch(() => null)) as
    | {
      status: string
      info?: string
      regeocode?: {
        formatted_address?: string
        addressComponent?: {
          province?: string
          city?: string
          district?: string
        }
      }
    }
    | null

  if (!data || data.status !== "1") {
    const info = data?.info ?? "empty response"
    // Key 类型不匹配:当前用的是 JS API Key,而 REST 接口需要 Web服务 Key
    if (info === "USERKEY_PLAT_NOMATCH") {
      throw new Error(
        "Amap regeo failed: USERKEY_PLAT_NOMATCH — 当前 Key 不是「Web服务」类型。"
        + " 请在高德控制台新建「Web服务」Key 并写入环境变量 AMAP_REST_KEY(不要复用 AMAP_KEY)。",
      )
    }
    throw new Error(`Amap regeo failed: ${info}`)
  }

  const regeocode = data.regeocode
  return {
    address: regeocode?.formatted_address ?? "",
    province: regeocode?.addressComponent?.province,
    city: regeocode?.addressComponent?.city,
    district: regeocode?.addressComponent?.district,
  }
}
