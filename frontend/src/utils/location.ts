import Taro from '@tarojs/taro'
import { getAMapLocation } from './amap'

/**
 * 获取当前位置(跨平台,统一返回 GCJ02 坐标)。
 *
 * - H5:使用高德定位插件(AMap.Geolocation),原生返回 GCJ02 坐标
 * - weapp / tt 等小程序:使用 Taro.getLocation({ type: 'gcj02' })
 *
 * 背景:Taro 4.1.9 H5 端 getLocation 不支持 gcj02 坐标系
 * (会报 "This coordinate system type is not temporarily supported"),
 * 因此 H5 端改用高德定位获取 GCJ02 坐标。
 *
 * @returns { latitude, longitude } GCJ02 坐标
 */
export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
  if (process.env.TARO_ENV === 'h5') {
    return getAMapLocation()
  }
  const res = await Taro.getLocation({ type: 'gcj02' })
  return { latitude: res.latitude, longitude: res.longitude }
}
