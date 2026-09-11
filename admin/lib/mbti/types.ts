/**
 * MBTI 模块共享类型与常量。
 *
 * 与 `db/schema.ts` 中的列类型保持一致(此处独立定义,
 * 避免 seed-data / scoring 等纯逻辑模块反向依赖 drizzle)。
 */

/** MBTI 四个维度 */
export const MBTI_DIMENSIONS = ["EI", "SN", "TF", "JP"] as const
export type MbtiDimension = (typeof MBTI_DIMENSIONS)[number]

/** MBTI 维度倾向字母 */
export const MBTI_LETTERS = ["E", "I", "S", "N", "T", "F", "J", "P"] as const
export type MbtiLetter = (typeof MBTI_LETTERS)[number]

/** MBTI 16 型代码 */
export const MBTI_TYPE_CODES = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const
export type MbtiTypeCode = (typeof MBTI_TYPE_CODES)[number]

/** 题目/推荐条目状态 */
export const MBTI_ITEM_STATUSES = ["active", "disabled"] as const
export type MbtiItemStatus = (typeof MBTI_ITEM_STATUSES)[number]

/** 答案选项(A/B 二选一) */
export const MBTI_ANSWER_OPTIONS = ["A", "B"] as const
export type MbtiAnswerOption = (typeof MBTI_ANSWER_OPTIONS)[number]

/**
 * 计分题目的最小结构(scoring 只关心维度与两个选项的计分字母,
 * 与 drizzle 行结构解耦,便于单测与 seed 复用)。
 */
export type MbtiScoringQuestion = {
  dimension: MbtiDimension
  optionAScore: MbtiLetter
  optionBScore: MbtiLetter
}

/** 单个维度的计票结果 */
export type MbtiDimensionScore = {
  /** 维度代码(EI/SN/TF/JP) */
  dimension: MbtiDimension
  /** 第一倾向字母(E/S/T/J) */
  first: MbtiLetter
  /** 第二倾向字母(I/N/F/P) */
  second: MbtiLetter
  /** 第一倾向得票数 */
  firstCount: number
  /** 第二倾向得票数 */
  secondCount: number
}

/** 各维度计票快照(按维度代码索引,落库/返回共用结构) */
export type MbtiDimensionScores = Record<MbtiDimension, MbtiDimensionScore>

/** 计分结果 */
export type MbtiScoreResult = {
  /** 四字母结果代码(如 'INTJ') */
  resultType: MbtiTypeCode
  /** 各维度计票快照 */
  dimensionScores: MbtiDimensionScores
}
