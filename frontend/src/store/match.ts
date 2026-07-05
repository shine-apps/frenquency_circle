import { create } from 'zustand'

/**
 * 匹配结果 Store。
 * 缓存最近一次"同频的人 / 同频的圈子"匹配结果,
 * 供首页与匹配结果页共享,避免重复请求与页面切换时数据丢失。
 */
interface MatchState {
  /** 同频的人列表 */
  people: MatchPersonDTO[]
  /** 同频的圈子列表 */
  circles: MatchCircleDTO[]
  /** 当前匹配使用的范围(公里) */
  rangeKm: number
  /** 当前匹配使用的位置(可空) */
  location: LocationPoint | null
  /** 当前匹配使用的标签 ID 列表 */
  tagIds: string[]
  /** 人列表总数(分页用) */
  totalPeople: number
  /** 圈子列表总数(分页用) */
  totalCircles: number
  /** 当前分页页码 */
  page: number
  /** 当前分页页大小 */
  pageSize: number
  /** 部分更新匹配结果(只更新传入的字段) */
  setMatchResult: (payload: {
    people?: MatchPersonDTO[]
    circles?: MatchCircleDTO[]
    rangeKm: number
    location: LocationPoint | null
    tagIds: string[]
    totalPeople?: number
    totalCircles?: number
  }) => void
  /** 重置为初始状态 */
  clearMatch: () => void
}

/** 初始状态(空数据) */
const INITIAL: Omit<
  MatchState,
  'setMatchResult' | 'clearMatch'
> = {
  people: [],
  circles: [],
  rangeKm: 5,
  location: null,
  tagIds: [],
  totalPeople: 0,
  totalCircles: 0,
  page: 1,
  pageSize: 20,
}

export const useMatchStore = create<MatchState>((set) => ({
  ...INITIAL,

  setMatchResult: (payload) =>
    set((state) => ({
      people: payload.people !== undefined ? payload.people : state.people,
      circles: payload.circles !== undefined ? payload.circles : state.circles,
      rangeKm: payload.rangeKm,
      location: payload.location,
      tagIds: payload.tagIds,
      totalPeople:
        payload.totalPeople !== undefined ? payload.totalPeople : state.totalPeople,
      totalCircles:
        payload.totalCircles !== undefined
          ? payload.totalCircles
          : state.totalCircles,
    })),

  clearMatch: () => set({ ...INITIAL }),
}))
