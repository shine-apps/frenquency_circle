/**
 * 高亮匹配片段类型。
 * - `text: string` 片段文本
 * - `highlight: boolean` 是否高亮
 */
export interface HighlightSegment {
  text: string
  highlight: boolean
}

/**
 * 转义正则表达式中的特殊字符，防止正则注入。
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 按关键词拆分文本为高亮/非高亮片段数组。
 *
 * @param text 原始文本(支持中英文混合)
 * @param keyword 搜索关键词(空字符串时返回原文本、不高亮)
 * @returns HighlightSegment[] 可直接在模板中 v-for 渲染
 *
 * @example
 * highlightText('书法爱好者', '书法')
 * // [{ text: '书法', highlight: true }, { text: '爱好者', highlight: false }]
 *
 * @example
 * highlightText('Hello World', 'Wo')
 * // [{ text: 'Hello ', highlight: false }, { text: 'Wo', highlight: true }, { text: 'rld', highlight: false }]
 */
export function highlightText(text: string, keyword: string): HighlightSegment[] {
  if (!text)
    return [{ text: '', highlight: false }]
  if (!keyword || !keyword.trim())
    return [{ text, highlight: false }]

  const trimmed = keyword.trim()
  const escaped = escapeRegExp(trimmed)
  const regex = new RegExp(`(${escaped})`, 'gi')

  const parts = text.split(regex)

  return parts.map(part => ({
    text: part,
    highlight: regex.test(part),
  }))
}

/**
 * 判断文本是否被关键词命中(用于 markedFields 检查)。
 */
export function isFieldMatched(
  matchedFields: string[] | undefined,
  field: string,
): boolean {
  if (!matchedFields || matchedFields.length === 0)
    return false
  return matchedFields.includes(field)
}
