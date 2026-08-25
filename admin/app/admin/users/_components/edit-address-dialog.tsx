"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2Icon, MapPinIcon, SearchIcon, XIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { UserDTO } from "@/types/api"
import {
  loadAMap,
  reverseGeocode,
  searchPlaces,
  type PlaceSearchResult,
} from "@/lib/amap"

/** 逆地理编码防抖时长(ms) */
const REVERSE_GEOCODE_DEBOUNCE = 300
/** 搜索防抖时长(ms) */
const SEARCH_DEBOUNCE = 400
/** 地图兜底中心点(北京天安门) */
const FALLBACK_CENTER = { lat: 39.908823, lng: 116.39747 }

export function EditAddressDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserDTO
  onClose: () => void
  onSaved: () => void
}) {
  const containerId = useRef(
    `amap-edit-addr-${Math.random().toString(36).slice(2, 10)}`
  ).current
  const mapRef = useRef<any>(null)

  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    user.location
      ? { lat: user.location.latitude, lng: user.location.longitude }
      : null
  )
  const [address, setAddress] = useState(user.address ?? "")
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")
  const [keyword, setKeyword] = useState("")
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // 计时器 / 请求令牌 ref，卸载时清理
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geoReqIdRef = useRef(0)

  /** 等待地图容器 DOM 挂载并具备尺寸(dialog 动画存在时序,轮询兜底) */
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

  async function initMap() {
    setLoading(true)
    setErrorMsg("")
    try {
      // 初始中心点：用户已有位置则用其位置，否则兜底北京
      const lat = center?.lat ?? FALLBACK_CENTER.lat
      const lng = center?.lng ?? FALLBACK_CENTER.lng

      const AMap = await loadAMap()
      const el = await waitForContainer()
      if (!el) throw new Error("地图容器 DOM 未就绪")

      mapRef.current = new AMap.Map(el, {
        zoom: 16,
        center: [lng, lat],
        resizeEnable: true,
      })

      // 拖动地图 → 取中心点 → 防抖逆地理编码
      mapRef.current.on("mapmove", () => {
        setShowResults(false)
        const c = mapRef.current.getCenter()
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = setTimeout(() => {
          const curLat = c.getLat()
          const curLng = c.getLng()
          setCenter({ lat: curLat, lng: curLng })
          const myId = ++geoReqIdRef.current
          void reverseGeocode(curLat, curLng).then((addr) => {
            if (myId === geoReqIdRef.current) setAddress(addr)
          })
        }, REVERSE_GEOCODE_DEBOUNCE)
      })

      setCenter({ lat, lng })
      const myId = ++geoReqIdRef.current
      const addr = await reverseGeocode(lat, lng)
      if (myId === geoReqIdRef.current) setAddress(addr)
    } catch (err) {
      console.error("[EditAddressDialog] 地图初始化失败:", err)
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

  function handleSearchInput() {
    setShowResults(true)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const kw = keyword.trim()
    if (!kw) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimerRef.current = setTimeout(() => {
      void searchPlaces(kw).then((res) => {
        if (kw === keyword.trim()) {
          setResults(res)
          setSearching(false)
        }
      })
    }, SEARCH_DEBOUNCE)
  }

  function handleSelectPlace(poi: PlaceSearchResult) {
    if (!mapRef.current) return
    // setCenter 会触发 mapmove，进而逆地理编码更新地址
    mapRef.current.setCenter([poi.lng, poi.lat])
    setCenter({ lat: poi.lat, lng: poi.lng })
    setAddress(poi.name)
    setKeyword(poi.name)
    setResults([])
    setShowResults(false)
  }

  function clearSearch() {
    setKeyword("")
    setResults([])
    setShowResults(false)
    setSearching(false)
  }

  async function handleSave() {
    if (!center) {
      setSaveError("请先选择地址")
      return
    }
    setBusy(true)
    setSaveError(null)
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address || null,
        location: {
          latitude: center.lat,
          longitude: center.lng,
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      onSaved()
    } else {
      setSaveError(data.message || "保存失败")
    }
  }

  async function handleClear() {
    setBusy(true)
    setSaveError(null)
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: null, location: null }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      onSaved()
    } else {
      setSaveError(data.message || "保存失败")
    }
  }

  useEffect(() => {
    // 延迟一帧，确保 dialog 弹层已挂载并具备尺寸
    const timer = setTimeout(() => void initMap(), 100)
    return () => {
      clearTimeout(timer)
      destroyMap()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>编辑地址</DialogTitle>
          <DialogDescription>
            修改 {user.name} 的位置，拖动地图或搜索选择地址。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* 当前地址 + 清除 */}
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate" title={address}>
              {address || "尚未设置地址"}
            </span>
            {user.address || user.location ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => void handleClear()}
                disabled={busy}
              >
                清除地址
              </Button>
            ) : null}
          </div>

          {/* 地图区域 */}
          <div className="relative h-[360px] overflow-hidden rounded-lg border">
            {/* 搜索框（覆盖在地图上方） */}
            <div className="absolute left-3 right-3 top-3 z-20">
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 shadow-sm">
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value)
                    handleSearchInput()
                  }}
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
                          <span className="block truncate text-sm">
                            {poi.name}
                          </span>
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

          <p className="text-xs text-muted-foreground">
            拖动地图使红色标记对准目标位置，地址会自动获取。
          </p>

          {saveError ? (
            <p className="text-sm text-destructive">{saveError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={busy || loading || !!errorMsg || !center}
          >
            {busy ? "保存中…" : "保存地址"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
