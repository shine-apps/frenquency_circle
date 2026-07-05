import { create } from 'zustand'

/**
 * 当前位置 Store。
 * 缓存发布页选定的当前位置(经纬度 + 地址),
 * 供发布定位页与首页共享,避免各页面重复获取定位。
 */
interface LocationState {
  /** 纬度(未获取为 null) */
  latitude: number | null
  /** 经度(未获取为 null) */
  longitude: number | null
  /** 逆地理编码地址(可空) */
  address: string | null
  /** 设置当前位置(纬度、经度、地址) */
  setLocation: (lat: number, lng: number, address: string | null) => void
  /** 清除当前位置 */
  clearLocation: () => void
}

export const useLocationStore = create<LocationState>((set) => ({
  latitude: null,
  longitude: null,
  address: null,

  setLocation: (lat, lng, address) =>
    set({ latitude: lat, longitude: lng, address }),

  clearLocation: () =>
    set({ latitude: null, longitude: null, address: null }),
}))
