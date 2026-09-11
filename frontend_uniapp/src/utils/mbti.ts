/**
 * MBTI 16 型展示辅助:按气质组配色(结果页徽章渐变 / 16 型网格着色)。
 *
 * 四组气质:
 * - 分析家(NT) 紫   #7C5CBF
 * - 外交家(NF) 绿   #02A887
 * - 守护者(SJ) 蓝   #3B82F6
 * - 探险家(SP) 橙   #F5A623
 */

export type MbtiTemperament = 'analyst' | 'diplomat' | 'sentinel' | 'explorer'

/**
 * 类型代码 → 气质组(未知代码回退 analyst)。
 *
 * MBTI 四组气质判定规则(按第2/3/4位字母,不是连续 slice):
 * - 分析家: 第2位=N 且 第3位=T  (INTJ/INTP/ENTJ/ENTP)
 * - 外交家: 第2位=N 且 第3位=F  (INFJ/INFP/ENFJ/ENFP)
 * - 守护者: 第2位=S 且 第4位=J  (ISTJ/ISFJ/ESTJ/ESFJ)
 * - 探险家: 第2位=S 且 第4位=P  (ISTP/ISFP/ESTP/ESFP)
 */
export function getTemperament(typeCode: string): MbtiTemperament {
  const code = typeCode.toUpperCase()
  const second = code[1] // S/N
  const third = code[2]  // T/F
  const fourth = code[3] // J/P
  if (second === 'N' && third === 'T') return 'analyst'
  if (second === 'N' && third === 'F') return 'diplomat'
  if (second === 'S' && fourth === 'J') return 'sentinel'
  if (second === 'S' && fourth === 'P') return 'explorer'
  return 'analyst'
}

/** 气质组主色(用于文字 / 描边) */
export const TEMPERAMENT_COLORS: Record<MbtiTemperament, string> = {
  analyst: '#7C5CBF',
  diplomat: '#02A887',
  sentinel: '#3B82F6',
  explorer: '#F5A623',
}

/** 气质组浅色背景(用于标签底色) */
export const TEMPERAMENT_SOFT_BG: Record<MbtiTemperament, string> = {
  analyst: '#f1ecf9',
  diplomat: '#e8f5f1',
  sentinel: '#eaf2fe',
  explorer: '#fdf3e7',
}

/** 气质组名称 */
export const TEMPERAMENT_LABELS: Record<MbtiTemperament, string> = {
  analyst: '分析家',
  diplomat: '外交家',
  sentinel: '守护者',
  explorer: '探险家',
}

/** 结果页徽章的 CSS 渐变背景(主色 → 加深) */
export function getTypeGradient(typeCode: string): string {
  const gradients: Record<MbtiTemperament, string> = {
    analyst: 'linear-gradient(135deg, #9b7fd4 0%, #6a4aa8 100%)',
    diplomat: 'linear-gradient(135deg, #35c4a0 0%, #017d66 100%)',
    sentinel: 'linear-gradient(135deg, #6ba3f5 0%, #2568c9 100%)',
    explorer: 'linear-gradient(135deg, #f8b95c 0%, #dd8f12 100%)',
  }
  return gradients[getTemperament(typeCode)]
}

/** 某维度计票中倾向字母的展示占比(0-100,用于得分条) */
export function dimensionPercent(firstCount: number, secondCount: number): number {
  const total = firstCount + secondCount
  if (total === 0)
    return 50
  return Math.round((firstCount / total) * 100)
}
