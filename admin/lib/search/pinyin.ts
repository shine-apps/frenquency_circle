import { pinyin } from "pinyin-pro"

/**
 * 拼音工具封装。
 *
 * 基于 `pinyin-pro` 提供两个纯函数:
 * - `toPinyin(str)`:返回去声调的全拼小写,如 "陈氏太极拳" → "chenshitaijiquan"
 * - `toPinyinInitials(str)`:返回首字母小写,如 "陈氏太极拳" → "cstjq"
 *
 * 非中文字符原样保留(数字、字母、标点),空字符串返回空字符串。
 * 与 `db/seed.ts` 中的 `computePinyin` 保持一致语义,以便种子数据与运行时计算可对齐。
 */

/**
 * 判断字符是否为中文字符(CJK 统一表意文字)。
 */
function isChineseChar(ch: string): boolean {
  const code = ch.codePointAt(0)
  if (code === undefined) return false
  // CJK 统一表意文字基本区:U+4E00 ~ U+9FFF
  return code >= 0x4e00 && code <= 0x9fff
}

/**
 * 将字符串转为去声调的全拼小写。
 * - 中文字符:转拼音连写
 * - 非中文字符:原样保留
 * - 空字符串返回空字符串
 *
 * 示例:
 *   toPinyin("陈氏太极拳") === "chenshitaijiquan"
 *   toPinyin("陈氏太极拳85式") === "chenshitaijiquan85shi"
 *   toPinyin("") === ""
 *   toPinyin("abc") === "abc"
 */
export function toPinyin(str: string): string {
  if (!str) return ""
  // 使用 pinyin-pro:toneType "none" 去声调,非中文字符默认保留
  // 注意 pinyin-pro 默认会把 "85" 当作非中文字符原样返回,符合预期
  return pinyin(str, {
    toneType: "none",
    type: "array",
    // 非中文字符保持原样(不过滤)
    nonZh: "consecutive",
  })
    .join("")
    .toLowerCase()
}

/**
 * 将字符串转为首字母小写形式。
 * - 中文字符:取拼音首字母
 * - 非中文字符:原样保留
 * - 空字符串返回空字符串
 *
 * 示例:
 *   toPinyinInitials("陈氏太极拳") === "cstjq"
 *   toPinyinInitials("陈氏太极拳85式") === "cstjq85shi"
 *   toPinyinInitials("") === ""
 *   toPinyinInitials("abc") === "abc"
 */
export function toPinyinInitials(str: string): string {
  if (!str) return ""
  // pattern "first" 取每个汉字拼音的首字母
  return pinyin(str, {
    pattern: "first",
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  })
    .join("")
    .toLowerCase()
}

// 重导出便于测试与上层模块引用
export { isChineseChar }
