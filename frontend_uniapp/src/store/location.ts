import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 当前位置 Store(对应原 Taro 项目 store/location.ts 的 useLocationStore)。
 * 缓存发布页选定的当前位置(经纬度 + 地址),
 * 供发布定位页与首页共享,避免各页面重复获取定位。
 */
export const useLocationStore = defineStore('location', () => {
  /** 纬度(未获取为 null) */
  const latitude = ref<number | null>(null)
  /** 经度(未获取为 null) */
  const longitude = ref<number | null>(null)
  /** 逆地理编码地址(可空) */
  const address = ref<string | null>(null)

  /** 设置当前位置(纬度、经度、地址) */
  function setLocation(lat: number, lng: number, addressValue: string | null) {
    latitude.value = lat
    longitude.value = lng
    address.value = addressValue
  }

  /** 清除当前位置 */
  function clearLocation() {
    latitude.value = null
    longitude.value = null
    address.value = null
  }

  return {
    latitude,
    longitude,
    address,
    setLocation,
    clearLocation,
  }
})
