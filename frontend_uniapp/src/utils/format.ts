/**
 * 通用展示格式化工具。
 * 首页 / 匹配 / 圈子 / 发现 / 用户主页等页面共用的格式化函数,统一出口避免重复实现。
 */

/** 距离格式化:不足 1km 显示米,否则显示 km */
export function formatDistance(km: number): string {
  if (km < 1)
    return `${(km * 1000).toFixed(0)}m`
  return `${km.toFixed(1)}km`
}

/** 日期时间格式化:YYYY-MM-DD HH:mm,无效/空返回"时间待定" */
export function formatDateTime(iso: string | null): string {
  if (!iso)
    return '时间待定'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime()))
      return '时间待定'
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  catch {
    return '时间待定'
  }
}

/**
 * 日期格式化:YYYY-MM-DD(可指定分隔符),无效/空返回 fallback(默认 '')。
 * @example formatDate('2026-08-14T10:00:00Z')        // '2026-08-14'
 * @example formatDate('bad', '未知', '/')             // '未知'
 */
export function formatDate(iso: string | null, fallback = '', separator = '-'): string {
  if (!iso)
    return fallback
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime()))
      return fallback
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${separator}${pad(d.getMonth() + 1)}${separator}${pad(d.getDate())}`
  }
  catch {
    return fallback
  }
}

/** 活动时间简短格式化:M月D日 HH:mm,无效/空返回"时间待定"(发现页列表用) */
export function formatActivityTime(iso: string | null): string {
  if (!iso)
    return '时间待定'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime()))
      return '时间待定'
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${pad(d.getMinutes())}`
  }
  catch {
    return '时间待定'
  }
}

/**
 * 视频时长格式化:秒 → `mm:ss`(不足 1 小时)/ `h:mm:ss`(超过 1 小时)。
 * 空值 / 负数返回 fallback(默认 `--:--`,表示时长未知)。
 * @example formatDuration(600)        // '10:00'
 * @example formatDuration(3725)       // '1:02:05'
 * @example formatDuration(null)       // '--:--'
 */
export function formatDuration(seconds: number | null | undefined, fallback = '--:--'): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0)
    return fallback
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * 课程总时长的友好文案:秒 → 「X 小时 Y 分钟 / Y 分钟 / 不足 1 分钟」。
 * 0 / 负数 / 非有限数返回 fallback(默认「时长待补充」,用于课时未探测时长的场景)。
 * @example formatTotalDuration(3725)  // '1 小时 2 分钟'
 * @example formatTotalDuration(600)   // '10 分钟'
 * @example formatTotalDuration(45)    // '不足 1 分钟'
 * @example formatTotalDuration(0)     // '时长待补充'
 */
export function formatTotalDuration(seconds: number | null | undefined, fallback = '时长待补充'): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0)
    return fallback
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.ceil((total % 3600) / 60)
  if (total < 60)
    return '不足 1 分钟'
  if (h > 0)
    return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
  return `${m} 分钟`
}

/** 练习年限格式化,空返回 fallback(默认 '') */
export function practiceYearsText(years: number | null, fallback = ''): string {
  if (years === null || years === undefined)
    return fallback
  return `${years}年`
}

/** 活跃度文案(详细):活跃度:低/中/高 */
export function activityLevelText(level: string): string {
  if (level === 'low')
    return '活跃度:低'
  if (level === 'medium')
    return '活跃度:中'
  return '活跃度:高'
}

/** 活跃度文案(简短):低活跃/中活跃/高活跃(发现页/用户主页等紧凑场景用) */
export function activityLevelShortText(level: string): string {
  if (level === 'low')
    return '低活跃'
  if (level === 'medium')
    return '中活跃'
  return '高活跃'
}

/**
 * 去除 HTML 标签,返回纯文本。
 * 用于历史富文本数据降级展示/编辑回填(项目从富文本编辑器迁移到纯文本 textarea)。
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}
