/**
 * 获取当前位置(跨平台,统一返回 GCJ02 坐标)。
 *
 * - H5:使用高德定位插件(AMap.Geolocation),原生返回 GCJ02 坐标
 * - 小程序端:使用 uni.getLocation({ type: 'gcj02' })
 *
 * @returns { latitude, longitude } GCJ02 坐标
 */
export async function getCurrentLocation(): Promise<{ latitude: number, longitude: number }> {
  // #ifdef H5
  const { getAMapLocation } = await import('./amap')
  return getAMapLocation()
  // #endif

  // #ifndef H5
  const res = await uni.getLocation({ type: 'gcj02' })
  return { latitude: res.latitude, longitude: res.longitude }
  // #endif
}
