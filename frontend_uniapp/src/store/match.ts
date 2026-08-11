import type { LocationPoint, MatchCircleDTO, MatchPersonDTO } from '@/types'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 匹配结果 Store(对应原 Taro 项目 store/match.ts 的 useMatchStore)。
 * 缓存最近一次"同频的人 / 同频的圈子"匹配结果,
 * 供首页与匹配结果页共享,避免重复请求与页面切换时数据丢失。
 */
export const useMatchStore = defineStore('match', () => {
  /** 同频的人列表 */
  const people = ref<MatchPersonDTO[]>([])
  /** 同频的圈子列表 */
  const circles = ref<MatchCircleDTO[]>([])
  /** 当前匹配使用的范围(公里) */
  const rangeKm = ref(5)
  /** 当前匹配使用的位置(可空) */
  const location = ref<LocationPoint | null>(null)
  /** 当前匹配使用的标签名称列表 */
  const tags = ref<string[]>([])
  /** 人列表总数(分页用) */
  const totalPeople = ref(0)
  /** 圈子列表总数(分页用) */
  const totalCircles = ref(0)
  /** 当前分页页码 */
  const page = ref(1)
  /** 当前分页页大小 */
  const pageSize = ref(20)

  /** 部分更新匹配结果(只更新传入的字段) */
  function setMatchResult(payload: {
    people?: MatchPersonDTO[]
    circles?: MatchCircleDTO[]
    rangeKm: number
    location: LocationPoint | null
    tags: string[]
    totalPeople?: number
    totalCircles?: number
  }) {
    if (payload.people !== undefined)
      people.value = payload.people
    if (payload.circles !== undefined)
      circles.value = payload.circles
    rangeKm.value = payload.rangeKm
    location.value = payload.location
    tags.value = payload.tags
    if (payload.totalPeople !== undefined)
      totalPeople.value = payload.totalPeople
    if (payload.totalCircles !== undefined)
      totalCircles.value = payload.totalCircles
  }

  /** 重置为初始状态 */
  function clearMatch() {
    people.value = []
    circles.value = []
    rangeKm.value = 5
    location.value = null
    tags.value = []
    totalPeople.value = 0
    totalCircles.value = 0
    page.value = 1
    pageSize.value = 20
  }

  return {
    people,
    circles,
    rangeKm,
    location,
    tags,
    totalPeople,
    totalCircles,
    page,
    pageSize,
    setMatchResult,
    clearMatch,
  }
})
