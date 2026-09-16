"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Loader2Icon, MapPinIcon, SearchIcon, XIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  loadAMap,
  reverseGeocode,
  searchPlaces,
  type PlaceSearchResult,
} from "@/lib/amap"

/**
 * 高德地图选点组件(受控)。
 *
 * 供管理员改用户地址与教师后台建圈/改圈共用,避免地图初始化、POI 搜索、
 * 逆地理编码这套逻辑出现多份副本。
 *
 * 关键语义:**只有用户主动操作才会回调 `onChange`**。
 * - 拖动地图结束(`dragend`)→ 防抖逆地理编码 → `onChange({ latitude, longitude, address })`
 * - 搜索并选中 POI → 地图移到该点 → `onChange`
 * - 挂载时仅按 `value` 定位地图中心用于展示,**不回调**(否则会把兜底中心点
 *   "北京天安门"当成用户的选择写进表单)
 *
 * `value` 为 `null` 表示尚未选择地点,底部会给出对应提示;调用方据此做必填校验。
 * 初始中心只在挂载时读取一次,切换目标时请通过 `key` 重新挂载。
 */

/** 选点结果 */
export type LocationValue = {
  latitude: number
  longitude: number
  address: string
}

/** 逆地理编码防抖时长(ms) */
const REVERSE_GEOCODE_DEBOUNCE = 300
/** POI 搜索防抖时长(ms) */
const SEARCH_DEBOUNCE = 400
/** 地图兜底中心点(北京天安门);仅用于没有初值时定位视野,不代表已选点 */
const FALLBACK_CENTER = { lat: 39.908823, lng: 116.39747 }

/**
 * 高德地图实例在本组件里用到的最小接口子集。
 * `lib/amap.ts` 的 `loadAMap()` 返回第三方 SDK 对象,这里只声明实际调用的方法,
 * 避免 `any` 泄漏到本文件。
 */
type AmapMapInstance = {
  on: (event: string, handler: () => void) => void
  getCenter: () => { getLat: () => number; getLng: () => number }
  setCenter: (lngLat: [number, number]) => void
  destroy?: () => void
}

export function LocationPicker({
  value,
  onChange,
  heightClassName = "h-[240px] sm:h-[320px]",
}: {
  /** 当前选点(受控);为 null 时地图按兜底中心定位,且视为「尚未选择」 */
  value: LocationValue | null
  /** 选点变化回调(仅用户拖动地图或选中 POI 时触发) */
  onChange: (next: LocationValue) => void
  /** 地图区域高度类名,默认窄屏 240px / ≥640px 320px */
  heightClassName?: string
}) {
  // 用 useId 生成稳定且纯的容器 id(避免在渲染期调用 Math.random)
  const containerId = `amap-location-picker-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const mapRef = useRef<AmapMapInstance | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")
  const [keyword, setKeyword] = useState("")
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  // 计时器 / 请求令牌 ref，卸载时清理
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geoReqIdRef = useRef(0)
  /** 最新搜索词(用于丢弃过期响应;直接比较闭包里的 state 恒为真) */
  const keywordRef = useRef("")

  /** 等待地图容器 DOM 挂载并具备尺寸(弹层动画存在时序,轮询兜底) */
  function waitForContainer(timeout = 3000): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      const start = Date.now()
      const tick = () => {
        const el = document.getElementById(containerId)
        if (el) {
          resolve(el)
          return
        }
        if (Date.now() - start > timeout) {
          resolve(null)
          return
        }
        setTimeout(tick, 30)
      }
      tick()
    })
  }

  /** 取当前地图中心并逆地理编码后回调(用户拖动结束 / 选中 POI 时调用) */
  function commitCenter(overrideAddress?: string) {
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter()
    const latitude = c.getLat()
    const longitude = c.getLng()
    const myId = ++geoReqIdRef.current

    if (overrideAddress !== undefined) {
      onChangeRef.current({ latitude, longitude, address: overrideAddress })
      return
    }
    void reverseGeocode(latitude, longitude).then((addr) => {
      if (myId !== geoReqIdRef.current) return
      onChangeRef.current({ latitude, longitude, address: addr })
    })
  }

  async function initMap() {
    setLoading(true)
    setErrorMsg("")
    try {
      const lat = value?.latitude ?? FALLBACK_CENTER.lat
      const lng = value?.longitude ?? FALLBACK_CENTER.lng

      const AMap = await loadAMap()
      const el = await waitForContainer()
      if (!el) throw new Error("地图容器 DOM 未就绪")

      const map: AmapMapInstance = new AMap.Map(el, {
        zoom: 16,
        center: [lng, lat],
        resizeEnable: true,
      })
      mapRef.current = map

      // 拖动过程中先收起搜索结果
      map.on("mapmove", () => setShowResults(false))
      // 拖动结束 → 防抖逆地理编码回填(只认用户拖动,程序化 setCenter 不触发 dragend)
      map.on("dragend", () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = setTimeout(() => {
          commitCenter()
        }, REVERSE_GEOCODE_DEBOUNCE)
      })
    } catch (err) {
      console.error("[LocationPicker] 地图初始化失败:", err)
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function destroyMap() {
    geoReqIdRef.current++
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
    mapRef.current?.destroy?.()
    mapRef.current = null
  }

  function handleRetry() {
    destroyMap()
    setTimeout(() => void initMap(), 50)
  }

  /** 搜索框输入:带上最新值做防抖,空输入立即清空下拉 */
  function handleSearchChange(next: string) {
    setKeyword(next)
    keywordRef.current = next
    setShowResults(true)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    const kw = next.trim()
    if (!kw) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimerRef.current = setTimeout(() => {
      void searchPlaces(kw).then((res) => {
        // 丢弃过期响应(用户已改了关键词)
        if (kw !== keywordRef.current.trim()) return
        setResults(res)
        setSearching(false)
      })
    }, SEARCH_DEBOUNCE)
  }

  function handleSelectPlace(poi: PlaceSearchResult) {
    const map = mapRef.current
    if (!map) return
    map.setCenter([poi.lng, poi.lat])
    setKeyword(poi.name)
    keywordRef.current = poi.name
    setResults([])
    setShowResults(false)
    setSearching(false)
    // 地址以 POI 名称为准(比逆地理结果更贴合用户意图)
    onChangeRef.current({
      latitude: poi.lat,
      longitude: poi.lng,
      address: poi.name || poi.address,
    })
  }

  function clearSearch() {
    setKeyword("")
    keywordRef.current = ""
    setResults([])
    setShowResults(false)
    setSearching(false)
  }

  useEffect(() => {
    // 延迟一帧，确保弹层已挂载并具备尺寸
    const timer = setTimeout(() => void initMap(), 100)
    return () => {
      clearTimeout(timer)
      destroyMap()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-3">
      <div className={`relative overflow-hidden rounded-lg border ${heightClassName}`}>
        {/* 搜索框（覆盖在地图上方） */}
        <div className="absolute left-3 right-3 top-3 z-20">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 shadow-sm">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="搜索地点，如：天安门"
              className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
              disabled={loading || !!errorMsg}
            />
            {keyword ? (
              <button
                type="button"
                onClick={clearSearch}
                className="text-muted-foreground hover:text-foreground"
                aria-label="清空搜索"
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </div>

          {/* 搜索结果下拉 */}
          {showResults && (searching || results.length > 0) ? (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-background shadow-lg">
              {searching ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  搜索中…
                </div>
              ) : (
                <>
                  {results.map((poi) => (
                    <button
                      key={poi.id}
                      type="button"
                      onClick={() => handleSelectPlace(poi)}
                      className="block w-full border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted"
                    >
                      <span className="block truncate text-sm">{poi.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {poi.district}
                        {poi.address}
                      </span>
                    </button>
                  ))}
                  {!searching && results.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      未找到相关地点
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* 地图容器 */}
        <div id={containerId} className="h-full w-full" />

        {/* 中心图钉（固定在地图视觉中心） */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full text-red-500">
          <MapPinIcon className="size-7 fill-red-500/20" />
        </div>

        {/* 加载遮罩 */}
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              地图加载中…
            </div>
          </div>
        ) : null}

        {/* 加载失败遮罩 */}
        {!loading && errorMsg ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/95 px-6">
            <p className="text-sm">地图加载失败</p>
            <p className="max-w-md text-center text-xs text-muted-foreground">
              {errorMsg}
            </p>
            <Button size="sm" onClick={handleRetry}>
              重新加载
            </Button>
          </div>
        ) : null}
      </div>

      {value ? (
        <p className="text-xs text-muted-foreground">
          拖动地图使红色标记对准目标位置，地址会自动获取。当前：
          <span className="text-foreground">{value.address || "已定位"}</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          尚未选择地点：拖动地图或搜索地点后，会自动填入地址与坐标。
        </p>
      )}
    </div>
  )
}
